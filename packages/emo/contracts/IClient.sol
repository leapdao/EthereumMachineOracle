// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.6.0;
pragma experimental ABIEncoderV2;

interface IClient {

  function trueCallback (
    bytes32 claimKey
  ) external;

  function falseCallback (
    bytes32 claimKey
  ) external;

  function defensePayoutCallback (
    bytes32 claimKey
  ) external payable;
}
