const Machine = artifacts.require("Machine");
const Merkle = artifacts.require("Merkle");

const ClaimVerifier = artifacts.require("ClaimVerifier");
const ClaimFalsifier = artifacts.require("ClaimFalsifier");

const Client = artifacts.require("Client");

module.exports = async function(deployer) {
  await deployer.deploy(Machine);
  await deployer.deploy(Merkle);
  
  await deployer.link(Machine, [ClaimFalsifier, ClaimVerifier, Client]);
  await deployer.link(Merkle, ClaimFalsifier);

  await deployer.deploy(Client);
  await deployer.deploy(ClaimFalsifier);
  await deployer.deploy(ClaimVerifier, ClaimFalsifier.address, Client.address);
};
