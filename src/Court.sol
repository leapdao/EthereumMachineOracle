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
    address prosecutor;
    uint lastActionTimestamp;
    uint numberOfSteps;
    uint disagreementPoint;
    uint depth;
    bool goRight;
    Merkle.TreeNode defendantNode;
    Merkle.TreeNode prosecutorNode;
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
    external view returns (IOracle);

  function getDispute(
    bytes32 disputeKey
  ) external view returns (Dispute memory);

  function newDispute (
    bytes32 answerKey,
    Merkle.TreeNode calldata prosecutorNode
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
  uint public STAKE_SIZE;
  uint public MAX_TREE_DEPTH;

  function getDispute (
    bytes32 disputeKey
  ) external view override returns (Dispute memory)
  {
    return disputes[disputeKey];
  }
    
  function newDispute (
    bytes32 answerKey,
    Merkle.TreeNode calldata prosecutorNode
  ) override external payable
  {
    bytes32 prosecutorRoot = prosecutorNode.hash();
    Dispute memory dispute = disputes[prosecutorRoot];

    require(msg.value >= STAKE_SIZE, "Not enough stake sent.");
    require(dispute.state == DisputeState.DoesNotExist, "Dispute already exists.");
    require(_answerExists(answerKey), "Answer does not exists.");
    require(_enoughTimeForDispute(answerKey), "There is not enough time left for a dispute.");

    dispute.answerKey = answerKey;
    dispute.state = DisputeState.Opened;
    dispute.prosecutor = msg.sender;
    dispute.lastActionTimestamp = now;
    dispute.prosecutorNode = prosecutorNode;

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

    require(dispute.state == DisputeState.Opened, "Dispute state is not correct for this action.");
    require(leftRoot == defendantRoot, "Left proof root does not match claimed root.");
    require(rightRoot == defendantRoot, "Right proof root does not match claimed root.");
    require(leftLeaf == answer.questionKey, "Left leaf does not match initial state hash.");
    require(rightLeaf == Machine.stateHash(finalState), "Right leaf does not match the final state hash.");
    require(Machine.imageHash(Machine.project(finalState)) == dispute.answerKey, "The revealed final state does not produce the image hash submitted in answer.");
    require(Machine.isTerminal(finalState), "The revealed final state is not terminal");

    dispute.defendantRoot = defendantRoot;
    dispute.defendantNode = node;
    dispute.lastActionTimestamp = now;
    dispute.state = DisputeState.ProsecutorTurn;
    dispute.numberOfSteps = proofRight.index();
    dispute.goRight = _goRight(dispute.prosecutorNode, dispute.defendantNode);
    dispute.disagreementPoint = _updateDisagreementPoint(dispute.disagreementPoint, dispute.goRight);
    dispute.depth = 1;

    emit Reveal(disputeKey, defendantRoot, finalState);
  }

  function prosecutorRespond (
    bytes32 disputeKey,
    Merkle.TreeNode calldata node
  ) override external
  {
    Dispute memory dispute = disputes[disputeKey];
    
    require(dispute.state == DisputeState.ProsecutorTurn, "Dispute state is not correct for this action.");
    require(dispute.goRight ? node.hash() == dispute.prosecutorNode.right : node.hash() == dispute.prosecutorNode.left, "Brought node from the wrong side.");

    dispute.prosecutorNode = node;
    dispute.lastActionTimestamp = now;
    dispute.state = DisputeState.DefendantTurn;

    // emit something
  }

  function defendantRespond (
    bytes32 disputeKey,
    Merkle.TreeNode calldata node
  ) override external
  {
    Dispute memory dispute = disputes[disputeKey];

    require(dispute.state == DisputeState.DefendantTurn, "Dispute state is not correct for this action.");
    require(dispute.goRight ? node.hash() == dispute.defendantNode.right : node.hash() == dispute.prosecutorNode.left, "Brought node from the wrong side.");

    dispute.defendantNode = node;
    dispute.lastActionTimestamp = now;
    dispute.goRight = _goRight(dispute.prosecutorNode, dispute.defendantNode);
    dispute.disagreementPoint = _updateDisagreementPoint(dispute.disagreementPoint, dispute.goRight);
    dispute.depth += 1;

    if (_reachedBottom(dispute.depth)) {
      if (dispute.disagreementPoint > dispute.numberOfSteps) {
        delete disputes[disputeKey];
        payable(oracle.answers(dispute.answerKey).answerer).call.value(STAKE_SIZE)("");
      } else {
        dispute.state = DisputeState.Bottom;
      }
    } else {
      dispute.state = DisputeState.ProsecutorTurn;
    }
  }
    

  function _answerExists (
    bytes32 answerKey
  ) virtual internal view returns (bool);

  function _enoughTimeForDispute (
    bytes32 answerKey
  ) virtual internal view returns (bool);

  function _goRight (
    Merkle.TreeNode memory prosecutorNode,
    Merkle.TreeNode memory defendantNode
  ) virtual internal pure returns (bool);

  function _updateDisagreementPoint (
    uint disagreementPoint,
    bool goRight
  ) virtual internal pure returns (uint);

  function _reachedBottom (
    uint depth
  ) internal view returns (bool)
  {
    return depth == MAX_TREE_DEPTH;
  }
  
}
