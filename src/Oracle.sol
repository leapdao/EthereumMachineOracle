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
  ) external;

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
