pragma solidity >=0.5.0;
pragma experimental ABIEncoderV2;

import "./ExampleMachine.sol";

contract Test {

  using Machine for uint;

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
  }

  function echidna_generateState() public returns (bool) {
    (Machine.State memory s1, Machine.State memory s2) = rand().generate();

    return Machine.stateHash(s1) == Machine.stateHash(s2);
  }

  function echidna_imageHash() public returns (bool) {
    (Machine.State memory s1, Machine.State memory s2) = rand().generate();

    return Machine.imageHash(Machine.project(s1)) == Machine.imageHash(Machine.project(s2)); 
  }

  function echidna_noninterference() public returns (bool) {
    (Machine.State memory s1, Machine.State memory s2) = rand().generate();

    (Machine.State memory s1n, bool ok1) = Machine.next(s1);
    (Machine.State memory s2n, bool ok2) = Machine.next(s2);

    if (!ok1 || !ok2) {
      return true;
    }

    return Machine.stateHash(s1n) == Machine.stateHash(s2n);
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
