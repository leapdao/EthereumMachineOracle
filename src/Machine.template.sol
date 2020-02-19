pragma solidity >=0.5.0;
pragma experimental ABIEncoderV2;


// Solidity does not allow empty stutcts, hence the temporary bool values.
library Machine {
  
  struct State {
    bool temp;
  }

  struct Seed {
    bool temp;
  }

  struct Image {
    bool temp;
  }

  function create(Seed memory _seed)
    public
    pure
    returns (State memory)
  {

  }

  function project(State memory _state)
    public
    pure
    returns (Image memory)
  {
  
  }

  function isTerminal(State memory _state)
    public
    pure
    returns (bool)
  {

  }

  // next can fail is _state is "dark" where next needs to operate
  function next(State memory _state)
    public
    pure
    returns (State memory, bool)
  {

  }

  function stateHash(State memory _state)
    public
    pure
    returns (bytes32)
  {

  }

  function imageHash(Image memory _image)
    public
    pure
    returns (bytes32)
  {

  }
}
