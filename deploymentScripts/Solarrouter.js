const {ether} = require("hardhat");
async function main() {
    const [deployer] = await ethers.getSigners();
    console.log(deployer.address);
    const SolarRouter = await ethers.getContractFactory("SolarRouter02");
    const router = await SolarRouter.deploy("0x8cdcb1223cf12a103980d17830e0353962a45b7d","0xa00744882684c3e4747faefd68d283ea44099d03",);
    console.log("SolarRouter deployed to:", router.address);
}
main()
.then(() => process.exit(0))
.catch((error) => {
    console.error(error);
    process.exit(1);
})