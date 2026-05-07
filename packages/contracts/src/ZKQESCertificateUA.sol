// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.8.24;

import { ERC721 } from "openzeppelin-contracts/token/ERC721/ERC721.sol";
import { CertificateRenderer } from "./CertificateRenderer.sol";
import { IZKQESRegistryUA } from "@zkqes/contracts-sdk/IZKQESRegistryUA.sol";
import { VerifiedUkrainian } from "@zkqes/contracts-sdk/VerifiedUkrainian.sol";

/// @notice ERC-721 transferable certificate, mintable only by holders
///         of an active V5.4 ZKQES binding while the mint window is
///         open. One mint per binding (per identity).
///
///         V5.4 redesign vs ZkqesCertificate (V5.2):
///           - Caller passes their bindingId (V5.4 has no wallet→bid
///             reverse map; off-chain computed via
///             keccak256(abi.encode("UA", identityFingerprint))).
///           - Uniqueness keyed by `binding.nullifier` (write-once on
///             first-claim per V5.4 spec) so re-mints under the same
///             identity revert ALREADY_MINTED.
///           - VerifiedUkrainian's onlyVerifiedUkrainian modifier centralises the
///             pk/revoked checks; same surface third-party dApps use
///             via the contracts-sdk.
contract ZKQESCertificateUA is ERC721, VerifiedUkrainian {
    uint64 public immutable mintDeadline;
    string public chainLabel;

    mapping(bytes32 => uint256) public tokenIdByNullifier;
    mapping(uint256 => bytes32) private _nullifierByTokenId;
    uint256 private _nextTokenId;

    error MintClosed();
    error AlreadyMinted(bytes32 nullifier, uint256 existingTokenId);

    event CertificateMinted(
        uint256 indexed tokenId,
        address indexed holder,
        bytes32 indexed nullifier,
        bytes32 bindingId,
        uint64  mintTimestamp
    );

    constructor(
        IZKQESRegistryUA _registry,
        uint64           _mintDeadline,
        string memory    _chainLabel
    )
        ERC721("Verified Identity Certificate", "VIC")
        VerifiedUkrainian(_registry)
    {
        mintDeadline = _mintDeadline;
        chainLabel   = _chainLabel;
    }

    function mint(bytes32 bindingId)
        external
        onlyVerifiedUkrainian(bindingId)
        returns (uint256 tokenId)
    {
        if (block.timestamp > mintDeadline) revert MintClosed();

        IZKQESRegistryUA.Binding memory b = zkqesRegistryUa.getBinding(bindingId);
        bytes32 nullifier = bytes32(b.nullifier);
        uint256 existing = tokenIdByNullifier[nullifier];
        if (existing != 0) revert AlreadyMinted(nullifier, existing);

        unchecked { tokenId = ++_nextTokenId; }
        tokenIdByNullifier[nullifier]   = tokenId;
        _nullifierByTokenId[tokenId]    = nullifier;
        _safeMint(msg.sender, tokenId);
        emit CertificateMinted(tokenId, msg.sender, nullifier, bindingId, uint64(block.timestamp));
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        bytes32 nullifier = _nullifierByTokenId[tokenId];
        return CertificateRenderer.tokenURI(tokenId, nullifier, chainLabel, uint64(block.timestamp));
    }
}
