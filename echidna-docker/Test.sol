pragma solidity >=0.5.0;
pragma experimental ABIEncoderV2;

import "./ExampleMachine.sol";

contract Test {

  uint r = 0;

  /* function echidna_test1() public returns (bool) { */
  /*   uint[] memory a = new uint[](3); */
  /*   a[0] = 1; */
  /*   a[1] = 2; */
  /*   a[2] = 3; */
  /*   Machine.Seed memory seed = Machine.Seed({ */
  /*     nums: a */
  /*   }); */

  /*   return true; */
  /* } */

  function echidna_generateDarkStack() public returns (bool) {
    (DarkStack.Stack memory s1, DarkStack.Stack memory s2) = DarkStack.generate(rand());

    return DarkStack.hash(s1) == DarkStack.hash(s2);
    /* return true; */
  }

  function setR(uint random) public {
    r = random;
  }

  function rand() public returns (uint) {
    uint fresh = uint(keccak256(abi.encode(r)));
    r = fresh;
    return r;
  }
  
}
