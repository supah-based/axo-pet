// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";

interface IAxoPetGearMarketToken is IERC1155 {
    function availableBalanceOf(address account, uint256 gearId) external view returns (uint256);
}

/// @title AXO Pet Gear Marketplace
/// @notice Fixed-price, non-escrow sales of unequipped AXO Pet ERC-1155 cosmetics for one exact ERC-20.
/// @dev The market never handles soulbound pets, custody of gear, platform fees, auctions, or gameplay power.
contract AxoPetGearMarketplace is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    error ApprovalRequired();
    error InexactPayment();
    error InvalidAddress();
    error InvalidAmount();
    error InvalidDuration();
    error InvalidPrice();
    error ListingExpired();
    error ListingInactive();
    error ListingStillExecutable();
    error NotListingSeller();
    error RenounceDisabled();
    error SelfPurchaseForbidden();
    error UnequippedBalanceInsufficient();

    uint64 public constant MIN_LISTING_DURATION = 5 minutes;
    uint64 public constant MAX_LISTING_DURATION = 30 days;

    struct Listing {
        address seller;
        uint256 gearId;
        uint128 remaining;
        uint128 unitPrice;
        uint64 expiresAt;
        bool active;
    }

    IAxoPetGearMarketToken public immutable gearToken;
    IERC20 public immutable paymentToken;
    uint256 public nextListingId = 1;
    uint256 public activeListingCount;

    mapping(uint256 listingId => Listing listing) public listings;

    event ListingCreated(
        uint256 indexed listingId,
        address indexed seller,
        uint256 indexed gearId,
        uint128 amount,
        uint128 unitPrice,
        uint64 expiresAt
    );
    event ListingFilled(
        uint256 indexed listingId,
        address indexed buyer,
        uint128 amount,
        uint256 totalPrice,
        uint128 remaining
    );
    event ListingCancelled(uint256 indexed listingId, address indexed seller, uint128 remaining);
    event ListingInvalidated(uint256 indexed listingId, address indexed caller, uint128 remaining);

    constructor(address initialOwner, address gearContract, address exactPaymentToken) Ownable(initialOwner) {
        if (initialOwner == address(0) || gearContract == address(0) || exactPaymentToken == address(0)) {
            revert InvalidAddress();
        }
        gearToken = IAxoPetGearMarketToken(gearContract);
        paymentToken = IERC20(exactPaymentToken);
        _pause();
    }

    function createListing(uint256 gearId, uint128 amount, uint128 unitPrice, uint64 expiresAt)
        external
        whenNotPaused
        nonReentrant
        returns (uint256 listingId)
    {
        if (amount == 0) revert InvalidAmount();
        if (unitPrice == 0) revert InvalidPrice();
        if (expiresAt < block.timestamp + MIN_LISTING_DURATION || expiresAt > block.timestamp + MAX_LISTING_DURATION) {
            revert InvalidDuration();
        }
        if (!gearToken.isApprovedForAll(msg.sender, address(this))) revert ApprovalRequired();
        if (gearToken.availableBalanceOf(msg.sender, gearId) < amount) revert UnequippedBalanceInsufficient();

        listingId = nextListingId++;
        listings[listingId] = Listing({
            seller: msg.sender,
            gearId: gearId,
            remaining: amount,
            unitPrice: unitPrice,
            expiresAt: expiresAt,
            active: true
        });
        activeListingCount += 1;
        emit ListingCreated(listingId, msg.sender, gearId, amount, unitPrice, expiresAt);
    }

    function purchase(uint256 listingId, uint128 amount) external whenNotPaused nonReentrant {
        Listing storage listing = listings[listingId];
        if (!listing.active) revert ListingInactive();
        if (listing.expiresAt <= block.timestamp) revert ListingExpired();
        if (msg.sender == listing.seller) revert SelfPurchaseForbidden();
        if (amount == 0 || amount > listing.remaining) revert InvalidAmount();
        if (!gearToken.isApprovedForAll(listing.seller, address(this))) revert ApprovalRequired();
        // A seller moving or equipping any quantity that backs the listing
        // invalidates the whole offer. Buyers never inherit a partially backed
        // listing state.
        if (gearToken.availableBalanceOf(listing.seller, listing.gearId) < listing.remaining) {
            revert UnequippedBalanceInsufficient();
        }

        uint256 totalPrice = uint256(listing.unitPrice) * uint256(amount);
        uint256 sellerBalanceBefore = paymentToken.balanceOf(listing.seller);
        paymentToken.safeTransferFrom(msg.sender, listing.seller, totalPrice);
        if (paymentToken.balanceOf(listing.seller) != sellerBalanceBefore + totalPrice) revert InexactPayment();

        gearToken.safeTransferFrom(listing.seller, msg.sender, listing.gearId, amount, "");
        listing.remaining -= amount;
        if (listing.remaining == 0) {
            listing.active = false;
            activeListingCount -= 1;
        }
        emit ListingFilled(listingId, msg.sender, amount, totalPrice, listing.remaining);
    }

    function cancelListing(uint256 listingId) external {
        Listing storage listing = listings[listingId];
        if (!listing.active) revert ListingInactive();
        if (listing.seller != msg.sender) revert NotListingSeller();
        listing.active = false;
        activeListingCount -= 1;
        emit ListingCancelled(listingId, msg.sender, listing.remaining);
    }

    function invalidateListing(uint256 listingId) external {
        Listing storage listing = listings[listingId];
        if (!listing.active) revert ListingInactive();
        if (listingExecutable(listingId)) revert ListingStillExecutable();
        listing.active = false;
        activeListingCount -= 1;
        emit ListingInvalidated(listingId, msg.sender, listing.remaining);
    }

    function listingExecutable(uint256 listingId) public view returns (bool) {
        Listing memory listing = listings[listingId];
        return listing.active
            && listing.remaining > 0
            && listing.expiresAt > block.timestamp
            && gearToken.isApprovedForAll(listing.seller, address(this))
            && gearToken.availableBalanceOf(listing.seller, listing.gearId) >= listing.remaining;
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
}
