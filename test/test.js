const {use, expect} = require('chai');
const {MockProvider, solidity, loadFixture} = require('ethereum-waffle');
const deploy = require("../deploy.js");
const ethers = require("ethers");

use(solidity);

const fixture = async (provider, [wallet]) => {
  const contracts = await deploy(wallet)();
  return contracts;
}

describe('EMO', () => {

  it('test1', async () => {
    const [machine, merkle, oracle, court] = await loadFixture(fixture);
    const question = await oracle.getAnswer(ethers.constants.HashZero);
    console.log(oracle.interface._abiCoder);
    
    const oldGetCoder = oracle.interface._abiCoder._getCoder;
    const handler = {
      apply: function(target, thisArg, argumentsList) {
        console.log(argumentsList);
        return target(...argumentsList);
      }
    };
    const newGetCoder = new Proxy(oldGetCoder, handler);
    oracle.interface._abiCoder._getCoder = newGetCoder;

    const askTx = await oracle.ask(
      {
        temp: ["0x0000000000000000000000000000000000000000000000000000000000000000"]
      },
      5,
      "0x333333333333333333333333333333333333333333333333",
      "0x333333333333333333333333333333333333333333333333"
    );
  });
});
