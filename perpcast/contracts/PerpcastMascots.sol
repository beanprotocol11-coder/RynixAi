// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title Perpcast Mascots — 30 pixel-art mage mascots on Robinhood Chain.
/// Minimal, dependency-free ERC-721 (ERC-165 / ERC-721 / ERC-721Metadata / ERC-2981 / ERC-7572 contractURI).
/// Free public mint, one per wallet; the owner can override the metadata URIs.
/// Kept deliberately small so deployment fits inside conservative mobile-wallet gas caps.
contract PerpcastMascots {
    string public constant name = "Perpcast Mascots";
    string public constant symbol = "PCAST";
    uint256 public constant MAX_SUPPLY = 30;

    string private constant DEFAULT_BASE_URI = "https://perpcast.app/nft/meta/";
    string private constant DEFAULT_CONTRACT_URI = "https://perpcast.app/nft/collection.json";

    address public owner;
    string private _baseURI;
    string private _contractURI;
    uint256 public totalSupply;
    bool public mintOpen = true;

    mapping(uint256 => address) private _owners;
    mapping(address => uint256) private _balances;
    mapping(uint256 => address) private _approvals;
    mapping(address => mapping(address => bool)) private _operators;
    mapping(address => bool) public minted;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner);
        _;
    }

    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    // ----- minting -----

    function mint() external {
        require(mintOpen);
        require(!minted[msg.sender]);
        minted[msg.sender] = true;
        _mintNext(msg.sender);
    }

    function _mintNext(address to) internal {
        require(to != address(0));
        require(totalSupply < MAX_SUPPLY);
        uint256 id = ++totalSupply;
        _owners[id] = to;
        _balances[to] += 1;
        emit Transfer(address(0), to, id);
    }

    // ----- admin -----

    function setMintOpen(bool open) external onlyOwner {
        mintOpen = open;
    }

    function setBaseURI(string calldata uri) external onlyOwner {
        _baseURI = uri;
    }

    function setContractURI(string calldata uri) external onlyOwner {
        _contractURI = uri;
    }

    function transferOwnership(address to) external onlyOwner {
        require(to != address(0));
        emit OwnershipTransferred(owner, to);
        owner = to;
    }

    // ----- metadata -----

    function tokenURI(uint256 tokenId) external view returns (string memory) {
        require(_owners[tokenId] != address(0));
        string memory base = bytes(_baseURI).length == 0 ? DEFAULT_BASE_URI : _baseURI;
        return string(abi.encodePacked(base, _toString(tokenId), ".json"));
    }

    function contractURI() external view returns (string memory) {
        return bytes(_contractURI).length == 0 ? DEFAULT_CONTRACT_URI : _contractURI;
    }

    /// ERC-2981: 5% royalty to the collection owner.
    function royaltyInfo(uint256, uint256 salePrice) external view returns (address, uint256) {
        return (owner, (salePrice * 500) / 10_000);
    }

    function supportsInterface(bytes4 id) external pure returns (bool) {
        return id == 0x01ffc9a7 || id == 0x80ac58cd || id == 0x5b5e139f || id == 0x2a55205a;
    }

    // ----- ERC-721 -----

    function balanceOf(address a) external view returns (uint256) {
        require(a != address(0));
        return _balances[a];
    }

    function ownerOf(uint256 tokenId) public view returns (address) {
        address o = _owners[tokenId];
        require(o != address(0));
        return o;
    }

    function approve(address to, uint256 tokenId) external {
        address o = ownerOf(tokenId);
        require(msg.sender == o || _operators[o][msg.sender]);
        _approvals[tokenId] = to;
        emit Approval(o, to, tokenId);
    }

    function getApproved(uint256 tokenId) external view returns (address) {
        ownerOf(tokenId);
        return _approvals[tokenId];
    }

    function setApprovalForAll(address op, bool approved) external {
        _operators[msg.sender][op] = approved;
        emit ApprovalForAll(msg.sender, op, approved);
    }

    function isApprovedForAll(address o, address op) external view returns (bool) {
        return _operators[o][op];
    }

    function transferFrom(address from, address to, uint256 tokenId) public {
        address o = ownerOf(tokenId);
        require(o == from);
        require(to != address(0));
        require(msg.sender == o || msg.sender == _approvals[tokenId] || _operators[o][msg.sender]);
        delete _approvals[tokenId];
        _balances[from] -= 1;
        _balances[to] += 1;
        _owners[tokenId] = to;
        emit Transfer(from, to, tokenId);
    }

    function safeTransferFrom(address from, address to, uint256 tokenId) external {
        safeTransferFrom(from, to, tokenId, "");
    }

    function safeTransferFrom(address from, address to, uint256 tokenId, bytes memory data) public {
        transferFrom(from, to, tokenId);
        if (to.code.length > 0) {
            (bool ok, bytes memory ret) = to.call(
                abi.encodeWithSelector(0x150b7a02, msg.sender, from, tokenId, data)
            );
            require(ok && ret.length >= 32 && abi.decode(ret, (bytes4)) == 0x150b7a02);
        }
    }

    function _toString(uint256 v) internal pure returns (string memory) {
        if (v == 0) return "0";
        uint256 t = v;
        uint256 len;
        while (t != 0) {
            len++;
            t /= 10;
        }
        bytes memory b = new bytes(len);
        while (v != 0) {
            b[--len] = bytes1(uint8(48 + (v % 10)));
            v /= 10;
        }
        return string(b);
    }
}
