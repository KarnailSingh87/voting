// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title SecureVote
 * @notice On-chain source of truth for the SecureVote dApp.
 *         Stores vote hashes and per-candidate tallies immutably.
 *         Heavy metadata (profiles, images) stays in MongoDB.
 * @dev    Deployed on Polygon Amoy Testnet.
 */
contract SecureVote {
    // ── Owner ──────────────────────────────────────────────
    address public owner;

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    // ── Election struct ────────────────────────────────────
    struct Election {
        string  mongoId;        // MongoDB ObjectId (string)
        string  title;
        uint256 startTime;
        uint256 endTime;
        bool    exists;
        bool    finalized;
    }

    // ── Vote record ────────────────────────────────────────
    struct VoteRecord {
        bytes32 voteHash;       // SHA-256 hash of the vote (from backend)
        uint256 electionIndex;  // index in the elections array
        uint256 candidateIndex; // index in the election's candidate list
        uint256 timestamp;
        address voter;          // wallet that signed the tx
    }

    // ── Storage ────────────────────────────────────────────
    Election[] public elections;

    // electionIndex => candidateIndex => vote count
    mapping(uint256 => mapping(uint256 => uint256)) public voteCounts;

    // electionIndex => candidateIndex => candidate name hash (for display)
    mapping(uint256 => mapping(uint256 => string)) public candidateNames;

    // electionIndex => number of candidates
    mapping(uint256 => uint256) public candidateCount;

    // All vote records (append-only — immutable ledger)
    VoteRecord[] public votes;

    // Prevent double-voting: keccak256(walletAddress, electionIndex) => bool
    mapping(bytes32 => bool) public hasVotedOnChain;

    // Lookup: voteHash => index in votes array (+ 1, so 0 means "not found")
    mapping(bytes32 => uint256) public voteHashToIndex;

    // ── Events ─────────────────────────────────────────────
    event ElectionCreated(uint256 indexed electionIndex, string mongoId, string title);
    event CandidateAdded(uint256 indexed electionIndex, uint256 candidateIndex, string name);
    event VoteCast(
        uint256 indexed electionIndex,
        uint256 candidateIndex,
        bytes32 voteHash,
        address indexed voter,
        uint256 timestamp
    );
    event ElectionFinalized(uint256 indexed electionIndex);

    // ── Constructor ────────────────────────────────────────
    constructor() {
        owner = msg.sender;
    }

    // ── Admin functions ────────────────────────────────────

    /**
     * @notice Register an election on-chain (called by backend).
     */
    function createElection(
        string calldata _mongoId,
        string calldata _title,
        uint256 _startTime,
        uint256 _endTime
    ) external onlyOwner returns (uint256 electionIndex) {
        electionIndex = elections.length;
        elections.push(Election({
            mongoId:   _mongoId,
            title:     _title,
            startTime: _startTime,
            endTime:   _endTime,
            exists:    true,
            finalized: false
        }));
        emit ElectionCreated(electionIndex, _mongoId, _title);
    }

    /**
     * @notice Add a candidate to an election.
     */
    function addCandidate(
        uint256 _electionIndex,
        string calldata _name
    ) external onlyOwner returns (uint256 candidateIndex) {
        require(_electionIndex < elections.length, "Election does not exist");
        candidateIndex = candidateCount[_electionIndex];
        candidateNames[_electionIndex][candidateIndex] = _name;
        candidateCount[_electionIndex] = candidateIndex + 1;
        emit CandidateAdded(_electionIndex, candidateIndex, _name);
    }

    /**
     * @notice Finalize an election (no more votes accepted).
     */
    function finalizeElection(uint256 _electionIndex) external onlyOwner {
        require(_electionIndex < elections.length, "Election does not exist");
        elections[_electionIndex].finalized = true;
        emit ElectionFinalized(_electionIndex);
    }

    // ── Voting (called by voter's wallet via frontend) ────

    /**
     * @notice Record a vote on-chain. The voter signs this tx with MetaMask.
     * @param _electionIndex Index of the election
     * @param _candidateIndex Index of the candidate
     * @param _voteHash SHA-256 hash from the backend (cast as bytes32)
     */
    function castVote(
        uint256 _electionIndex,
        uint256 _candidateIndex,
        bytes32 _voteHash
    ) external {
        require(_electionIndex < elections.length, "Election does not exist");
        Election storage e = elections[_electionIndex];
        require(e.exists, "Election does not exist");
        require(!e.finalized, "Election finalized");
        require(block.timestamp >= e.startTime, "Election not started");
        require(block.timestamp <= e.endTime, "Election ended");
        require(_candidateIndex < candidateCount[_electionIndex], "Invalid candidate");

        // Double-vote prevention
        bytes32 key = keccak256(abi.encodePacked(msg.sender, _electionIndex));
        require(!hasVotedOnChain[key], "Already voted");
        hasVotedOnChain[key] = true;

        // Record the vote
        uint256 voteIndex = votes.length;
        votes.push(VoteRecord({
            voteHash:       _voteHash,
            electionIndex:  _electionIndex,
            candidateIndex: _candidateIndex,
            timestamp:      block.timestamp,
            voter:          msg.sender
        }));

        // Increment tally
        voteCounts[_electionIndex][_candidateIndex] += 1;

        // Index for lookup
        voteHashToIndex[_voteHash] = voteIndex + 1; // +1 so 0 = not found

        emit VoteCast(_electionIndex, _candidateIndex, _voteHash, msg.sender, block.timestamp);
    }

    // ── View functions (frontend reads directly) ──────────

    function getElectionCount() external view returns (uint256) {
        return elections.length;
    }

    function getTotalVotes() external view returns (uint256) {
        return votes.length;
    }

    function getVoteCount(uint256 _electionIndex, uint256 _candidateIndex)
        external view returns (uint256)
    {
        return voteCounts[_electionIndex][_candidateIndex];
    }

    function getCandidateName(uint256 _electionIndex, uint256 _candidateIndex)
        external view returns (string memory)
    {
        return candidateNames[_electionIndex][_candidateIndex];
    }

    function getCandidateCount(uint256 _electionIndex)
        external view returns (uint256)
    {
        return candidateCount[_electionIndex];
    }

    function getVoteByHash(bytes32 _voteHash)
        external view returns (bool found, VoteRecord memory record)
    {
        uint256 idx = voteHashToIndex[_voteHash];
        if (idx == 0) return (false, record);
        return (true, votes[idx - 1]);
    }

    function hasVoted(address _voter, uint256 _electionIndex)
        external view returns (bool)
    {
        bytes32 key = keccak256(abi.encodePacked(_voter, _electionIndex));
        return hasVotedOnChain[key];
    }

    /**
     * @notice Get full election results (all candidates + counts).
     */
    function getElectionResults(uint256 _electionIndex)
        external view
        returns (string[] memory names, uint256[] memory counts)
    {
        uint256 cc = candidateCount[_electionIndex];
        names  = new string[](cc);
        counts = new uint256[](cc);
        for (uint256 i = 0; i < cc; i++) {
            names[i]  = candidateNames[_electionIndex][i];
            counts[i] = voteCounts[_electionIndex][i];
        }
    }

    /**
     * @notice Transfer ownership (for multi-sig or upgrade path).
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Zero address");
        owner = newOwner;
    }
}
