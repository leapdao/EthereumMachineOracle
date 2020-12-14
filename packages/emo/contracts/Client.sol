// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.6.0;
pragma experimental ABIEncoderV2;

import "./IClient.sol";
import "./Machine.sol";

contract Client is IClient {

  function makeClaim (
    Machine.Seed calldata seed,
    bytes32 imageHash,
    bytes32 claimKey,
    uint timeout
  ) external payable
  {
    
  }
  
  function trueCallback (
    bytes32 claimKey
  ) external override
  {

  }

  function falseCallback (
    bytes32 claimKey
  ) external override
  {

  }

  function defensePayoutCallback (
    bytes32 claimKey
  ) external payable override
  {

  }
}
