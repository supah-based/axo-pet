// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {ERC1155Supply} from "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Supply.sol";
import {ERC1155URIStorage} from "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155URIStorage.sol";

interface IAxoSoulPetV2 {
    function ownerOf(uint256 tokenId) external view returns (address);
    function levelOf(uint256 tokenId) external view returns (uint8);
    function notifyGearUpdate(uint256 tokenId) external;
}

/// @title AXO Pet Gear V2 (candidate item-level ruleset)
/// @notice Tradable Level-10-to-20 ERC-1155 equipment that can be locked into one soulbound AXO Pet loadout.
/// @dev Gear may carry bounded Arena-only stats; it has no Hatchery XP, trust, research, access, rank, or reward effect.
contract AxoPetGearV2 is ERC1155URIStorage, ERC1155Supply, Ownable2Step, Pausable {
    error DuplicateGearId();
    error EquippedBalanceLocked();
    error GearAlreadyDefined();
    error GearAlreadyEquipped();
    error GearInactive();
    error GearNotDefined();
    error InvalidAddress();
    error InvalidAmount();
    error InvalidArenaStats();
    error InvalidMetadataUri();
    error InvalidSlot();
    error InvalidItemLevel();
    error LoadoutStatCap();
    error MaxSupplyExceeded();
    error NotPetOwner();
    error NothingEquipped();
    error PetLevelLocked();
    error RenounceDisabled();
    error UriHashMismatch();

    uint8 public constant SLOT_COUNT = 10;
    uint8 public constant ARENA_STAT_COUNT = 6;
    uint8 public constant MIN_EQUIP_LEVEL = 10;
    uint8 public constant MAX_ARENA_STAT_PER_ITEM = 6;
    uint8 public constant MAX_ARENA_STAT_TOTAL_PER_ITEM = 12;

    struct GearDefinition {
        uint8 slot;
        uint8 minimumPetLevel;
        bool active;
        uint256 maxSupply;
        bytes32 metadataHash;
        uint8[ARENA_STAT_COUNT] arenaStats;
    }

    IAxoSoulPetV2 public immutable petContract;
    string public contractURI;

    mapping(uint256 gearId => GearDefinition definition) public gearDefinitions;
    mapping(uint256 petTokenId => mapping(uint8 slot => uint256 gearId)) public equippedGear;
    mapping(address owner => mapping(uint256 gearId => uint256 amount)) public equippedBalances;
    mapping(uint256 petTokenId => uint64 revision) public loadoutRevision;

    event ContractURIChanged(string newContractURI);
    event GearDefined(
        uint256 indexed gearId,
        uint8 indexed slot,
        uint8 minimumPetLevel,
        uint256 maxSupply,
        bytes32 metadataHash,
        uint8[ARENA_STAT_COUNT] arenaStats
    );
    event GearStatusChanged(uint256 indexed gearId, bool active);
    event GearMetadataChanged(uint256 indexed gearId, bytes32 metadataHash);
    event GearEquipped(uint256 indexed petTokenId, address indexed owner, uint8 indexed slot, uint256 gearId, uint64 revision);
    event GearUnequipped(uint256 indexed petTokenId, address indexed owner, uint8 indexed slot, uint256 gearId, uint64 revision);

    constructor(address initialOwner, address soulPetContract, string memory initialContractURI)
        ERC1155("")
        Ownable(initialOwner)
    {
        if (initialOwner == address(0) || soulPetContract == address(0)) revert InvalidAddress();
        _validateIpfsUri(initialContractURI);
        petContract = IAxoSoulPetV2(soulPetContract);
        contractURI = initialContractURI;
    }

    function defineGear(
        uint256 gearId,
        uint8 slot,
        uint8 minimumPetLevel,
        uint256 maxSupply,
        string calldata metadataUri,
        bytes32 metadataHash,
        uint8[ARENA_STAT_COUNT] calldata arenaStats
    ) external onlyOwner {
        if (gearDefinitions[gearId].maxSupply != 0) revert GearAlreadyDefined();
        if (slot == 0 || slot > SLOT_COUNT) revert InvalidSlot();
        if (maxSupply == 0) revert InvalidAmount();
        _validateMetadata(metadataUri, metadataHash);
        _validateArenaStats(minimumPetLevel, arenaStats);
        gearDefinitions[gearId] = GearDefinition({
            slot: slot,
            minimumPetLevel: minimumPetLevel,
            active: true,
            maxSupply: maxSupply,
            metadataHash: metadataHash,
            arenaStats: arenaStats
        });
        _setURI(gearId, metadataUri);
        emit GearDefined(gearId, slot, minimumPetLevel, maxSupply, metadataHash, arenaStats);
    }

    function updateGearMetadata(uint256 gearId, string calldata metadataUri, bytes32 metadataHash) external onlyOwner {
        GearDefinition storage definition = gearDefinitions[gearId];
        if (definition.maxSupply == 0) revert GearNotDefined();
        _validateMetadata(metadataUri, metadataHash);
        definition.metadataHash = metadataHash;
        _setURI(gearId, metadataUri);
        emit GearMetadataChanged(gearId, metadataHash);
    }

    function setGearActive(uint256 gearId, bool active) external onlyOwner {
        GearDefinition storage definition = gearDefinitions[gearId];
        if (definition.maxSupply == 0) revert GearNotDefined();
        definition.active = active;
        emit GearStatusChanged(gearId, active);
    }

    function setContractURI(string calldata newContractURI) external onlyOwner {
        _validateIpfsUri(newContractURI);
        contractURI = newContractURI;
        emit ContractURIChanged(newContractURI);
    }

    function mintGear(address recipient, uint256 gearId, uint256 amount, bytes calldata data)
        external
        onlyOwner
        whenNotPaused
    {
        if (recipient == address(0)) revert InvalidAddress();
        if (amount == 0) revert InvalidAmount();
        GearDefinition memory definition = gearDefinitions[gearId];
        if (definition.maxSupply == 0) revert GearNotDefined();
        if (!definition.active) revert GearInactive();
        if (totalSupply(gearId) + amount > definition.maxSupply) revert MaxSupplyExceeded();
        _mint(recipient, gearId, amount, data);
    }

    function equip(uint256 petTokenId, uint8 slot, uint256 gearId) external whenNotPaused {
        if (petContract.ownerOf(petTokenId) != msg.sender) revert NotPetOwner();
        uint8 petLevel = petContract.levelOf(petTokenId);
        if (petLevel < MIN_EQUIP_LEVEL) revert PetLevelLocked();
        GearDefinition memory definition = gearDefinitions[gearId];
        if (definition.maxSupply == 0) revert GearNotDefined();
        if (!definition.active) revert GearInactive();
        if (petLevel < definition.minimumPetLevel) revert PetLevelLocked();
        if (slot == 0 || slot > SLOT_COUNT || definition.slot != slot) revert InvalidSlot();
        _validateLoadout(petTokenId, slot, definition, petLevel);
        uint256 previous = equippedGear[petTokenId][slot];
        if (previous == gearId) revert GearAlreadyEquipped();
        if (balanceOf(msg.sender, gearId) <= equippedBalances[msg.sender][gearId]) revert InvalidAmount();

        if (previous != 0) {
            equippedBalances[msg.sender][previous] -= 1;
            emit GearUnequipped(petTokenId, msg.sender, slot, previous, loadoutRevision[petTokenId] + 1);
        }
        equippedGear[petTokenId][slot] = gearId;
        equippedBalances[msg.sender][gearId] += 1;
        loadoutRevision[petTokenId] += 1;
        petContract.notifyGearUpdate(petTokenId);
        emit GearEquipped(petTokenId, msg.sender, slot, gearId, loadoutRevision[petTokenId]);
    }

    function unequip(uint256 petTokenId, uint8 slot) external whenNotPaused {
        if (petContract.ownerOf(petTokenId) != msg.sender) revert NotPetOwner();
        if (slot == 0 || slot > SLOT_COUNT) revert InvalidSlot();
        uint256 gearId = equippedGear[petTokenId][slot];
        if (gearId == 0) revert NothingEquipped();
        delete equippedGear[petTokenId][slot];
        equippedBalances[msg.sender][gearId] -= 1;
        loadoutRevision[petTokenId] += 1;
        petContract.notifyGearUpdate(petTokenId);
        emit GearUnequipped(petTokenId, msg.sender, slot, gearId, loadoutRevision[petTokenId]);
    }

    function loadout(uint256 petTokenId) external view returns (uint256[SLOT_COUNT] memory items) {
        for (uint8 slot = 1; slot <= SLOT_COUNT; slot++) {
            items[slot - 1] = equippedGear[petTokenId][slot];
        }
    }

    function availableBalanceOf(address account, uint256 gearId) external view returns (uint256) {
        return balanceOf(account, gearId) - equippedBalances[account][gearId];
    }

    function gearArenaStats(uint256 gearId) external view returns (uint8[ARENA_STAT_COUNT] memory) {
        GearDefinition memory definition = gearDefinitions[gearId];
        if (definition.maxSupply == 0) revert GearNotDefined();
        return definition.arenaStats;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function renounceOwnership() public pure override {
        revert RenounceDisabled();
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC1155)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    function uri(uint256 gearId) public view override(ERC1155, ERC1155URIStorage) returns (string memory) {
        return super.uri(gearId);
    }

    function _update(address from, address to, uint256[] memory ids, uint256[] memory values)
        internal
        override(ERC1155, ERC1155Supply)
    {
        if (paused()) revert EnforcedPause();
        if (from != address(0)) {
            for (uint256 i = 0; i < ids.length; i++) {
                for (uint256 j = i + 1; j < ids.length; j++) {
                    if (ids[i] == ids[j]) revert DuplicateGearId();
                }
                uint256 balance = balanceOf(from, ids[i]);
                if (values[i] > balance || balance - values[i] < equippedBalances[from][ids[i]]) {
                    revert EquippedBalanceLocked();
                }
            }
        }
        super._update(from, to, ids, values);
    }

    function _validateMetadata(string calldata metadataUri, bytes32 expectedHash) private pure {
        _validateIpfsUri(metadataUri);
        if (keccak256(bytes(metadataUri)) != expectedHash) revert UriHashMismatch();
    }

    function statBudgetForLevel(uint8 level) public pure returns (uint8) {
        if (level < MIN_EQUIP_LEVEL || level > 20) revert InvalidItemLevel();
        return 2 + level - 10;
    }

    function statCapForLevel(uint8 level) public pure returns (uint8) {
        return (statBudgetForLevel(level) + 1) / 2;
    }

    function _validateArenaStats(uint8 level, uint8[ARENA_STAT_COUNT] calldata arenaStats) private pure {
        uint8 budget = statBudgetForLevel(level);
        uint8 cap = statCapForLevel(level);
        uint256 total;
        for (uint8 i = 0; i < ARENA_STAT_COUNT; i++) {
            if (arenaStats[i] > cap) revert InvalidArenaStats();
            total += arenaStats[i];
        }
        if (total == 0 || total > budget) revert InvalidArenaStats();
    }

    function _validateLoadout(uint256 petTokenId, uint8 replacementSlot, GearDefinition memory replacement, uint8 level)
        private
        view
    {
        uint256[ARENA_STAT_COUNT] memory stats;
        uint256 total;
        for (uint8 slot = 1; slot <= SLOT_COUNT; slot++) {
            GearDefinition memory definition;
            if (slot == replacementSlot) definition = replacement;
            else {
                uint256 gearId = equippedGear[petTokenId][slot];
                if (gearId == 0) continue;
                definition = gearDefinitions[gearId];
            }
            for (uint8 i = 0; i < ARENA_STAT_COUNT; i++) {
                stats[i] += definition.arenaStats[i];
                total += definition.arenaStats[i];
            }
        }
        uint256 cap = uint256(statCapForLevel(level)) * 8;
        if (total > uint256(statBudgetForLevel(level)) * 10) revert LoadoutStatCap();
        for (uint8 i = 0; i < ARENA_STAT_COUNT; i++) {
            if (stats[i] > cap) revert LoadoutStatCap();
        }
    }

    function _validateIpfsUri(string memory metadataUri) private pure {
        bytes memory value = bytes(metadataUri);
        if (
            value.length < 8 || value.length > 192 || value[0] != "i" || value[1] != "p" || value[2] != "f"
                || value[3] != "s" || value[4] != ":" || value[5] != "/" || value[6] != "/"
        ) revert InvalidMetadataUri();
    }
}
