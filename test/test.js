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

    const askTx = await oracle.ask(
      {
        temp: ["0x0000000000000000000000000000000000000000000000000000000000000000"]
      },
      5,
      "0x333333333333333333333333333333333333333333333333",
      "0x333333333333333333333333333333333333333333333333"
    );
    await askTx.wait();
  });
});
