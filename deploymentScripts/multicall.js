const {ether} = require("hardhat");
async function main() {
    const [deployer] = await ethers.getSigners();
    console.log(deployer.address);
    const multicall = await ethers.getContractFactory("Multicall2");
    const multicallContract = await multicall.deploy();
    console.log("Multicall deployed to:", multicallContract.address);
}


main()
.then(() => process.exit(0))
.catch((error) => {
    console.error(error);
    process.exit(1);
})