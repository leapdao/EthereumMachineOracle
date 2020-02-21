pragma solidity >=0.6.0;
pragma experimental ABIEncoderV2;

import "./Oracle.sol";
import "./Merkle.sol";

interface ICourt {
  using Merkle for Merkle.TreeNode;
  using Merkle for Merkle.Proof;
  
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

  event NewDispute (
    bytes32 answerKey,
    bytes32 prosecutorRoot
  );

  event Reveal (
    bytes32 disputeKey,
    bytes32 defendantRoot,
    Machine.State finalState
  );

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
    Merkle.TreeNode calldata node,
    Merkle.Proof calldata proofLeft,
    Merkle.Proof calldata proofRight,
    Machine.State calldata finalState
  ) external;

  function prosecutorRespond (
    bytes32 disputeKey,
    Merkle.TreeNode calldata node
  ) external;

  function defendantRespond (
    bytes32 disputeKey,
    Merkle.TreeNode calldata node
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

    require(msg.value >= stakeSize, "Not enough stake sent.");
    require(dispute.state == DisputeState.DoesNotExist, "Dispute already exists.");
    require(_answerExists(answerKey), "Answer does not exists.");
    require(_enoughTimeForDispute(answerKey), "There is not enough time left for a dispute.");

    dispute.answerKey = answerKey;
    dispute.state = DisputeState.Opened;
    dispute.prosecutor = msg.sender;
    dispute.lastActionTimestamp = now;

    emit NewDispute(answerKey, prosecutorRoot);
  }

  function reveal (
    bytes32 disputeKey,
    Merkle.TreeNode calldata node,
    Merkle.Proof calldata proofLeft,
    Merkle.Proof calldata proofRight,
    Machine.State calldata finalState
  ) override external
  {
    Dispute memory dispute = disputes[disputeKey];
    IOracle.Answer memory answer = oracle.answers(dispute.answerKey);

    bytes32 defendantRoot = node.hash();
    (bytes32 leftLeaf, bytes32 leftRoot) = proofLeft.eval();
    (bytes32 rightLeaf, bytes32 rightRoot) = proofRight.eval();

    require(leftRoot == defendantRoot, "Left proof root does not match claimed root.");
    require(rightRoot == defendantRoot, "Right proof root does not match claimed root.");
    require(leftLeaf == answer.questionKey, "Left leaf does not match initial state hash.");
    require(rightLeaf == Machine.stateHash(finalState), "Right leaf does not match the final state hash.");
    require(Machine.imageHash(Machine.project(finalState)) == dispute.answerKey, "The revealed final state does not produce the image hash submitted in answer.");
    require(Machine.isTerminal(finalState), "The revealed final state is not terminal");

    dispute.defendantRoot = defendantRoot;
    dispute.current = defendantRoot;
    dispute.lastActionTimestamp = now;
    dispute.state = DisputeState.ProsecutorTurn;

    emit Reveal(disputeKey, defendantRoot, finalState);
  }
    

  function _answerExists (
    bytes32 answerKey
  ) virtual internal returns (bool);

  function _enoughTimeForDispute (
    bytes32 answerKey
  ) virtual internal returns (bool);
  
}
