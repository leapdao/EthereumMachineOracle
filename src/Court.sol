pragma solidity >=0.6.0;
pragma experimental ABIEncoderV2;

import "./Oracle.sol";

interface ICourt {
  enum DisputeState {
    DoesNotExist,
    Opened,
    ProsecutorTurn,
    DefendantTurn,
    Bottom
  }

  // disputeKey is prosecutorRoot
  struct Dispute {
    bytes32 answerKey;
    bytes32 defendantRoot;
    bytes32 current;
    address prosecutor;
    uint lastActionTimestamp;
    uint disagreementPoint;
    DisputeState state;
  }

  function oracle()
    external returns (IOracle);

  function getDispute(
    bytes32 disputeKey
  ) external returns (Dispute memory);

  function newDispute (
    bytes32 answerKey,
    bytes32 prosecutorRoot
  ) external payable;

  function reveal (
    bytes32 disputeKey,
    bytes32 left,
    bytes32 right,
    bytes calldata proofLeft,
    bytes calldata proofRight,
    Machine.State calldata finalState
  ) external;

  function prosecutorRespond (
    bytes32 disputeKey,
    bytes32 left,
    bytes32 right
  ) external;

  function defendantRespond (
    bytes32 disputeKey,
    bytes32 left,
    bytes32 right
  ) external;

  function defendantRevealBottom (
    bytes32 disputeKey,
    bytes calldata proof,
    Machine.State calldata state
  ) external;

  function timeout (
    bytes32 disputeKey
  ) external;
}

abstract contract ACourt is ICourt {

  IOracle public override oracle;
  mapping (bytes32 => Dispute) public disputes;
  uint public stakeSize;

  function getDispute (
    bytes32 disputeKey
  ) external override returns (Dispute memory)
  {
    return disputes[disputeKey];
  }
    
  function newDispute (
    bytes32 answerKey,
    bytes32 prosecutorRoot
  ) override external payable
  {
    Dispute memory dispute = disputes[prosecutorRoot];

    require(msg.value >= stakeSize, "Not enough stake sent");
    require(dispute.state == DisputeState.DoesNotExist, "Dispute already exists.");
    require(_answerExists(answerKey), "Answer does not exists.");
    require(_enoughTimeForDispute(answerKey), "There is not enough time left for a dispute");

    dispute.answerKey = answerKey;
    dispute.state = DisputeState.Opened;
    dispute.prosecutor = msg.sender;
    dispute.lastActionTimestamp = now;
  }

  

  function _answerExists (
    bytes32 answerKey
  ) virtual internal returns (bool);

  function _enoughTimeForDispute (
    bytes32 answerKey
  ) virtual internal returns (bool);
  
}
