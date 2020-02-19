pragma solidity >=0.6.0;
pragma experimental ABIEncoderV2;

// Import the library implementing the machine template here.
import "./Machine.template.sol";

interface IOracle {

  // questionKey is initialStateHash          
  struct Question {
    uint maturationTime;
    function(bytes32, Machine.Image memory) external successCallback;
    function(bytes32) external failCallback;
  }

  // answerKey is imageHash
  struct Answer {
    address answerer;
    bool falsified;
    bytes32 questionKey;
  }

  event NewQuestion (
    bytes32 questionKey,
    Machine.Seed seed,
    address asker
  );

  event NewAnswer (
    bytes32 questionKey,
    bytes32 answerKey
  );

  event AnswerFalsified (
    bytes32 questionKey,
    bytes32 answerKey
  );

  event QuestionResolvedSuccessfully (
    bytes32 questionKey,
    bytes32 answerKey
  );

  event QuestionResolvedUnsuccessfully (
    bytes32 questionKey
  );

  function questions (
    bytes32 questionKey
  ) external returns (Question memory);

  function answers (
    bytes32 answerKey
  ) external returns (Answer memory);

  function ask (
    Machine.Seed calldata seed,
    uint timeout,
    function(uint, Machine.Image memory) external successCallback,
    function(uint) external failCallback
  ) external;

  function answer (
    bytes32 questionKey,
    bytes32 imageHash
  ) external payable;

  // only Court
  function falsify (
    bytes32 answerKey,
    address prosecutor
  ) external payable;

  function resolveSuccess (
    bytes32 answerKey,
    Machine.Image calldata image
  ) external;

  function resolveFail (
    bytes32 questionKey
  ) external;
}

abstract contract AOracle is IOracle {
   
}

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
