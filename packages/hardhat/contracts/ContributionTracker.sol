// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

/// @title ContributionTracker
/// @notice Simple contract to record knowledge graph contribution points per address
contract ContributionTracker {
    mapping(address => uint256) public points;

    event ContributionReported(address indexed contributor, uint256 points);

    /// @notice Report a contribution for a user
    /// @param contributor Address of the contributor
    /// @param contribPoints Number of triples contributed (or arbitrary points)
    function reportContribution(address contributor, uint256 contribPoints) external {
        points[contributor] += contribPoints;
        emit ContributionReported(contributor, contribPoints);
    }

    /// @notice Get current points for a contributor
    /// @param contributor Address of the contributor
    /// @return totalPoints Current accumulated points
    function getPoints(address contributor) external view returns (uint256 totalPoints) {
        return points[contributor];
    }
} 