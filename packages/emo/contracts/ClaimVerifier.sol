// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.6.0;
pragma experimental ABIEncoderV2;

import "./Machine.sol";

interface IClaimVerifier {

  // claimKey is root of computation commitment
  struct Claim {
    uint claimTime;
    uint timeout;
    uint stake;
    bytes32 initialStateHash;
    bytes32 imageHash;
    function(bytes32) external trueCallback;
    function(bytes32) external falseCallback;
    function(bytes32) external payable defensePayoutCallback; 
  }

  event NewClaim (
    Machine.Seed seed,
    bytes32 imageHash,
    bytes32 claimKey
  );

  event TrueClaim (
    bytes32 claimKey
  );

  event FalseClaim (
    bytes32 claimKey
  );

  event CallbackFailed (
    bytes32 claimKey
  );

  function getClaim (
    bytes32 claimKey
  ) external view returns (Claim memory);

  // only Client
  function makeClaim (
    Machine.Seed calldata seed,
    bytes32 imageHash,
    bytes32 claimKey,
    uint timeout,
    function(bytes32) external trueCallback,
    function(bytes32) external falseCallback,
    function(bytes32) external payable payoutDefendant
  ) external payable;

  // only ClaimVerifier
  function falsifyClaim (
    bytes32 claimKey,
    address falsifier
  ) external;

  function resolveTrueClaim (
    bytes32 claimKey
  ) external;
}

contract ClaimVerifier is IClaimVerifier {
  mapping (bytes32 => Claim) public claims;

  address public CLAIM_FALSIFIER;
  address public CLIENT;

  constructor(address claimFalsifier, address client) public
  {
    CLAIM_FALSIFIER = claimFalsifier;
    CLIENT = client;
  }

  function getClaim (
    bytes32 claimKey
  ) override external view returns (Claim memory)
  {
    return claims[claimKey];
  }

  function makeClaim (
    Machine.Seed calldata seed,
    bytes32 imageHash,
    bytes32 claimKey,
    uint timeout,
    function(bytes32) external trueCallback,
    function(bytes32) external falseCallback,
    function(bytes32) external payable defensePayoutCallback
  ) override external payable
  {
    Claim storage claim = claims[claimKey];

    require(!_claimExists(claimKey), "Claim already exists.");
    require(msg.value > 0, "Stake must be greater than 0.");
    require(msg.sender == CLIENT, "Only client can make claims.");
    require(timeout > 0 && (2 * timeout) + now > (2 * timeout), "Timeout must be greater then zero and be in overflow bounds.");

    bytes32 initialStateHash = Machine.stateHash(Machine.create(seed));
    
    claim.claimTime = now;
    claim.timeout = timeout;
    claim.stake = msg.value;
    claim.initialStateHash = initialStateHash;
    claim.imageHash = imageHash;
    claim.trueCallback = trueCallback;
    claim.falseCallback = falseCallback;
    claim.defensePayoutCallback = defensePayoutCallback;

    emit NewClaim(seed, imageHash, claimKey);
  }

  function falsifyClaim (
    bytes32 claimKey,
    address falsifier
  ) override external
  {
    Claim storage claim = claims[claimKey];

    require(_claimExists(claimKey), "Claim does not exsist.");
    require(msg.sender == CLAIM_FALSIFIER, "Only claim falsifier can falsify answers");

    uint stake = claim.stake;
    function(bytes32) external callback = claim.falseCallback;

    delete claims[claimKey];

    payable(falsifier).call{value: stake}("");

    emit FalseClaim(claimKey);
    
    try callback(claimKey) {
    } catch {
      emit CallbackFailed(claimKey);
    }
  }

  function resolveTrueClaim (
    bytes32 claimKey
  ) override external
  {
    Claim storage claim = claims[claimKey];

    require(_claimExists(claimKey), "Claim must exist.");
    require(now >= claim.claimTime + claim.timeout, "Too early to resolve.");

    uint stake = claim.stake;
    function(bytes32) external callback = claim.trueCallback;

    delete claims[claimKey];

    payable(CLIENT).call{value: stake}("");

    emit TrueClaim(claimKey);

    try callback(claimKey) {
    } catch {
      emit CallbackFailed(claimKey);
    }
  }

  function _claimExists (
    bytes32 claimKey
  ) internal view returns (bool)
  {
    return claims[claimKey].claimTime > 0;
  }
  
}
