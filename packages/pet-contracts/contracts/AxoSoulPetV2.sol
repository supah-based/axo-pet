// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {ERC721URIStorage} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";

interface IERC5192V2 is IERC165 {
    event Locked(uint256 tokenId);
    event Unlocked(uint256 tokenId);

    function locked(uint256 tokenId) external view returns (bool);
}

/// @title AXO Pets V2 (candidate level-20 ruleset)
/// @notice One non-transferable, monotonically growing visual receipt per AXO Hatchery pet.
/// @dev The authoritative XP, trust, research, access, and reward ledger remains offchain.
contract AxoSoulPetV2 is ERC721URIStorage, Ownable2Step, Pausable, EIP712, ReentrancyGuard, IERC5192V2 {
    error ApprovalDisabled();
    error AuthorizationExpired();
    error AuthorizationUsed();
    error DnaAlreadyMinted();
    error GearContractOnly();
    error InvalidAddress();
    error InvalidMetadataUri();
    error InvalidPetState();
    error InvalidRevision();
    error InvalidSignature();
    error InvalidTokenId();
    error LevelDowngrade();
    error MintingDisabled();
    error PetOwnerOnly();
    error RecipientOnly();
    error RenounceDisabled();
    error Soulbound();
    error WalletAlreadyMinted();

    uint8 public constant MAX_LEVEL = 20;
    uint8 public constant LINEAGE_COUNT = 6;
    uint8 public constant ENVIRONMENT_COUNT = 8;
    uint8 public constant AURA_COUNT = 8;
    uint8 public constant GILL_COUNT = 6;
    uint8 public constant EYE_COUNT = 6;
    uint8 public constant MARKING_COUNT = 8;
    uint8 public constant SIGIL_COUNT = 12;
    uint8 public constant CONSTELLATION_COUNT = 8;
    uint8 public constant SPECIALIZATION_COUNT = 6;

    bytes32 public constant MINT_VOUCHER_TYPEHASH = keccak256(
        "MintVoucher(address recipient,uint256 tokenId,bytes32 genesisHash,bytes32 dnaHash,bytes32 stateHash,uint64 nonce,uint64 deadline,uint8 lineage,uint8 level,uint8 environment,uint8 aura,uint8 gill,uint8 eye,uint8 marking,uint8 sigil,uint8 constellation,uint8 specialization,bytes32 metadataHash)"
    );
    bytes32 public constant PET_UPDATE_TYPEHASH = keccak256(
        "PetUpdate(uint256 tokenId,bytes32 stateHash,uint64 revision,uint64 gearRevision,uint64 deadline,uint8 level,uint8 activeEnvironment,uint8 specialization,bytes32 metadataHash)"
    );

    struct MintVoucher {
        address recipient;
        uint256 tokenId;
        bytes32 genesisHash;
        bytes32 dnaHash;
        bytes32 stateHash;
        uint64 nonce;
        uint64 deadline;
        uint8 lineage;
        uint8 level;
        uint8 environment;
        uint8 aura;
        uint8 gill;
        uint8 eye;
        uint8 marking;
        uint8 sigil;
        uint8 constellation;
        uint8 specialization;
        bytes32 metadataHash;
    }

    struct PetUpdate {
        uint256 tokenId;
        bytes32 stateHash;
        uint64 revision;
        uint64 gearRevision;
        uint64 deadline;
        uint8 level;
        uint8 activeEnvironment;
        uint8 specialization;
        bytes32 metadataHash;
    }

    struct PetState {
        bytes32 genesisHash;
        bytes32 dnaHash;
        bytes32 stateHash;
        uint64 revision;
        uint64 gearRevision;
        uint8 lineage;
        uint8 level;
        uint8 originEnvironment;
        uint8 activeEnvironment;
        uint8 aura;
        uint8 gill;
        uint8 eye;
        uint8 marking;
        uint8 sigil;
        uint8 constellation;
        uint8 specialization;
    }

    address public stateSigner;
    address public gearContract;
    bool public mintingActive;
    uint256 public totalMinted;

    mapping(uint256 tokenId => PetState state) private _petStates;
    mapping(address wallet => bool minted) public walletEverMinted;
    mapping(bytes32 genesisHash => bool minted) public genesisEverMinted;
    mapping(address wallet => uint256 tokenId) public petOfWallet;
    mapping(bytes32 authorizationDigest => bool used) public usedMintAuthorization;

    event MintingStatusChanged(bool active);
    event StateSignerChanged(address indexed previousSigner, address indexed newSigner);
    event GearContractChanged(address indexed previousContract, address indexed newContract);
    event PetMinted(
        address indexed recipient,
        uint256 indexed tokenId,
        bytes32 indexed genesisHash,
        bytes32 dnaHash,
        uint8 lineage,
        uint8 level,
        bytes32 stateHash
    );
    event PetGrowthUpdated(
        uint256 indexed tokenId,
        uint8 previousLevel,
        uint8 newLevel,
        uint64 revision,
        bytes32 stateHash
    );
    event PetTraitsUpdated(
        uint256 indexed tokenId,
        uint8 activeEnvironment,
        uint8 specialization,
        uint64 revision,
        bytes32 stateHash
    );
    event PetGearLoadoutChanged(uint256 indexed tokenId, uint64 gearRevision);

    constructor(address initialOwner, address initialStateSigner)
        ERC721("AXO Pets", "AXOPET")
        Ownable(initialOwner)
        EIP712("AXO Pets", "2")
    {
        if (initialOwner == address(0) || initialStateSigner == address(0)) revert InvalidAddress();
        stateSigner = initialStateSigner;
    }

    function setMintingActive(bool active) external onlyOwner {
        mintingActive = active;
        emit MintingStatusChanged(active);
    }

    function setStateSigner(address newSigner) external onlyOwner {
        if (newSigner == address(0)) revert InvalidAddress();
        address previous = stateSigner;
        stateSigner = newSigner;
        emit StateSignerChanged(previous, newSigner);
    }

    function setGearContract(address newGearContract) external onlyOwner {
        if (newGearContract == address(0)) revert InvalidAddress();
        address previous = gearContract;
        gearContract = newGearContract;
        emit GearContractChanged(previous, newGearContract);
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

    function mintWithVoucher(MintVoucher calldata voucher, string calldata metadataUri, bytes calldata signature)
        external
        whenNotPaused
        nonReentrant
        returns (uint256 tokenId)
    {
        if (!mintingActive) revert MintingDisabled();
        if (voucher.recipient == address(0)) revert InvalidAddress();
        if (msg.sender != voucher.recipient) revert RecipientOnly();
        if (voucher.deadline < block.timestamp) revert AuthorizationExpired();
        if (voucher.genesisHash == bytes32(0) || voucher.dnaHash == bytes32(0) || voucher.stateHash == bytes32(0)) {
            revert InvalidPetState();
        }
        if (voucher.tokenId != uint256(voucher.genesisHash)) revert InvalidTokenId();
        if (walletEverMinted[voucher.recipient]) revert WalletAlreadyMinted();
        if (genesisEverMinted[voucher.genesisHash]) revert DnaAlreadyMinted();
        _validateTraitBounds(
            voucher.lineage,
            voucher.level,
            voucher.environment,
            voucher.aura,
            voucher.gill,
            voucher.eye,
            voucher.marking,
            voucher.sigil,
            voucher.constellation,
            voucher.specialization
        );
        _validateMetadata(metadataUri, voucher.metadataHash);

        bytes32 digest = _hashTypedDataV4(_hashMintVoucher(voucher));
        if (usedMintAuthorization[digest]) revert AuthorizationUsed();
        if (!SignatureChecker.isValidSignatureNow(stateSigner, digest, signature)) revert InvalidSignature();
        usedMintAuthorization[digest] = true;

        tokenId = voucher.tokenId;
        walletEverMinted[voucher.recipient] = true;
        genesisEverMinted[voucher.genesisHash] = true;
        petOfWallet[voucher.recipient] = tokenId;
        totalMinted += 1;
        _petStates[tokenId] = PetState({
            genesisHash: voucher.genesisHash,
            dnaHash: voucher.dnaHash,
            stateHash: voucher.stateHash,
            revision: 1,
            gearRevision: 0,
            lineage: voucher.lineage,
            level: voucher.level,
            originEnvironment: voucher.environment,
            activeEnvironment: voucher.environment,
            aura: voucher.aura,
            gill: voucher.gill,
            eye: voucher.eye,
            marking: voucher.marking,
            sigil: voucher.sigil,
            constellation: voucher.constellation,
            specialization: voucher.specialization
        });

        _safeMint(voucher.recipient, tokenId);
        _setTokenURI(tokenId, metadataUri);
        emit Locked(tokenId);
        emit PetMinted(
            voucher.recipient,
            tokenId,
            voucher.genesisHash,
            voucher.dnaHash,
            voucher.lineage,
            voucher.level,
            voucher.stateHash
        );
    }

    function updatePet(PetUpdate calldata update, string calldata metadataUri, bytes calldata signature)
        external
        whenNotPaused
        nonReentrant
    {
        PetState storage current = _petStates[update.tokenId];
        address tokenOwner = _ownerOf(update.tokenId);
        if (tokenOwner == address(0)) revert InvalidTokenId();
        if (msg.sender != tokenOwner) revert PetOwnerOnly();
        if (update.deadline < block.timestamp) revert AuthorizationExpired();
        if (update.stateHash == bytes32(0)) revert InvalidPetState();
        if (update.revision != current.revision + 1) revert InvalidRevision();
        if (update.gearRevision != current.gearRevision) revert InvalidRevision();
        if (update.level < current.level) revert LevelDowngrade();
        if (update.level == 0 || update.level > MAX_LEVEL) revert InvalidPetState();
        if (update.activeEnvironment >= ENVIRONMENT_COUNT || update.specialization >= SPECIALIZATION_COUNT) {
            revert InvalidPetState();
        }
        _validateMetadata(metadataUri, update.metadataHash);
        bytes32 digest = _hashTypedDataV4(_hashPetUpdate(update));
        if (!SignatureChecker.isValidSignatureNow(stateSigner, digest, signature)) revert InvalidSignature();

        uint8 previousLevel = current.level;
        current.level = update.level;
        current.activeEnvironment = update.activeEnvironment;
        current.specialization = update.specialization;
        current.stateHash = update.stateHash;
        current.revision = update.revision;
        _setTokenURI(update.tokenId, metadataUri);

        if (previousLevel != update.level) {
            emit PetGrowthUpdated(update.tokenId, previousLevel, update.level, update.revision, update.stateHash);
        }
        emit PetTraitsUpdated(
            update.tokenId,
            update.activeEnvironment,
            update.specialization,
            update.revision,
            update.stateHash
        );
    }

    function notifyGearUpdate(uint256 tokenId) external whenNotPaused nonReentrant {
        if (msg.sender != gearContract) revert GearContractOnly();
        if (_ownerOf(tokenId) == address(0)) revert InvalidTokenId();
        PetState storage current = _petStates[tokenId];
        current.gearRevision += 1;
        emit PetGearLoadoutChanged(tokenId, current.gearRevision);
    }

    function petState(uint256 tokenId) external view returns (PetState memory) {
        if (_ownerOf(tokenId) == address(0)) revert InvalidTokenId();
        return _petStates[tokenId];
    }

    function levelOf(uint256 tokenId) external view returns (uint8) {
        if (_ownerOf(tokenId) == address(0)) revert InvalidTokenId();
        return _petStates[tokenId].level;
    }

    function locked(uint256 tokenId) external view returns (bool) {
        if (_ownerOf(tokenId) == address(0)) revert InvalidTokenId();
        return true;
    }

    function approve(address, uint256) public pure override(ERC721, IERC721) {
        revert ApprovalDisabled();
    }

    function setApprovalForAll(address, bool) public pure override(ERC721, IERC721) {
        revert ApprovalDisabled();
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721URIStorage, IERC165) returns (bool) {
        return interfaceId == type(IERC5192V2).interfaceId || super.supportsInterface(interfaceId);
    }

    function _update(address to, uint256 tokenId, address auth) internal override(ERC721) returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) revert Soulbound();
        return super._update(to, tokenId, auth);
    }

    function _hashMintVoucher(MintVoucher calldata voucher) private pure returns (bytes32) {
        return keccak256(
            abi.encode(
                MINT_VOUCHER_TYPEHASH,
                voucher.recipient,
                voucher.tokenId,
                voucher.genesisHash,
                voucher.dnaHash,
                voucher.stateHash,
                voucher.nonce,
                voucher.deadline,
                voucher.lineage,
                voucher.level,
                voucher.environment,
                voucher.aura,
                voucher.gill,
                voucher.eye,
                voucher.marking,
                voucher.sigil,
                voucher.constellation,
                voucher.specialization,
                voucher.metadataHash
            )
        );
    }

    function _hashPetUpdate(PetUpdate calldata update) private pure returns (bytes32) {
        return keccak256(
            abi.encode(
                PET_UPDATE_TYPEHASH,
                update.tokenId,
                update.stateHash,
                update.revision,
                update.gearRevision,
                update.deadline,
                update.level,
                update.activeEnvironment,
                update.specialization,
                update.metadataHash
            )
        );
    }

    function _validateTraitBounds(
        uint8 lineage,
        uint8 level,
        uint8 environment,
        uint8 aura,
        uint8 gill,
        uint8 eye,
        uint8 marking,
        uint8 sigil,
        uint8 constellation,
        uint8 specialization
    ) private pure {
        if (
            lineage >= LINEAGE_COUNT || level == 0 || level > MAX_LEVEL || environment >= ENVIRONMENT_COUNT
                || aura >= AURA_COUNT || gill >= GILL_COUNT || eye >= EYE_COUNT || marking >= MARKING_COUNT
                || sigil >= SIGIL_COUNT || constellation >= CONSTELLATION_COUNT
                || specialization >= SPECIALIZATION_COUNT
        ) revert InvalidPetState();
    }

    function _validateMetadata(string calldata metadataUri, bytes32 expectedHash) private pure {
        bytes calldata value = bytes(metadataUri);
        if (
            value.length < 8 || value.length > 192 || value[0] != "i" || value[1] != "p" || value[2] != "f"
                || value[3] != "s" || value[4] != ":" || value[5] != "/" || value[6] != "/"
        ) revert InvalidMetadataUri();
        if (keccak256(value) != expectedHash) revert InvalidMetadataUri();
    }
}
