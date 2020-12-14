const ClaimVerifier = artifacts.require("ClaimVerifier");

contract("ClaimVerifier", async accounts => {
  it("test", async () => {
    let instance = await ClaimVerifier.deployed();
    let client = await instance.getClient.call();

    console.log(client);
  });
});
