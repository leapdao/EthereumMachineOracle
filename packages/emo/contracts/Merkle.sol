pragma solidity >=0.5.0;
pragma experimental ABIEncoderV2;


library Merkle {
  
  struct TreeNode {
    bytes32 left;
    bytes32 right;
  }

  struct Proof {
    bytes32[] data;
  }

  function hash (TreeNode memory self)
    public
    pure
    returns (bytes32)
  {
    return keccak256(abi.encodePacked(self.left, self.right));
  }

  function eval (Proof memory self)
    public
    pure
    returns (bytes32 leaf, bytes32 root, uint index)
  {
    
  }
  
}
