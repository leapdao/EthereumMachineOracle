pragma solidity >=0.5.0;
pragma experimental ABIEncoderV2;


library Merkle {
  
  struct TreeNode {
    bytes32 left;
    bytes32 right;
  }

  struct Proof {
    bytes32 leaf;
    bytes32[] data;
    uint8[] path;
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
    require(self.data.length == self.path.length, "data and path should be of the same size");

    leaf = self.leaf;
    root = leaf;
    index = 0;

    for (uint256 i = 0; i < self.data.length; i++) {
        bytes32 proofElement = self.data[i];
        index = (index << 1) | (self.path[self.data.length - i - 1] > 0 ? 0 : 1);

        if (self.path[i] > 0) {
            root = keccak256(abi.encodePacked(root, proofElement));
        } else {
            root = keccak256(abi.encodePacked(proofElement, root));
        }
    }
  }
  
}
