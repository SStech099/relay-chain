const {ether} = require("hardhat");
async function main() {
    const [deployer] = await ethers.getSigners();
    console.log(deployer.address);
    const SolarFactory = await ethers.getContractFactory("SolarFactory");
    const factory = await SolarFactory.deploy(deployer.address);
    console.log("SolarFactory deployed to:", factory.address);
    const hash = await factory.INIT_CODE_PAIR_HASH();
    console.log("Solar Factory INIT_HASH:", hash);
}


main()
.then(() => process.exit(0))
.catch((error) => {
    console.error(error);
    process.exit(1);
})