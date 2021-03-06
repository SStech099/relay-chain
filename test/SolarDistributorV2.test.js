const { ethers, network } = require("hardhat");
const { expect } = require("chai");
const { ADDRESS_ZERO, advanceTimeAndBlock, advanceBlockTo, latest, duration, increase, advanceTime, disableAutomine } = require("./utils");

describe("SolarDistributorV2", function () {
    before(async function () {
        this.signers = await ethers.getSigners();
        this.deployer = this.signers[0];
        this.bob = this.signers[1];
        this.carol = this.signers[2];
        this.dev = this.signers[3];
        this.treasury = this.signers[4];
        this.investor = this.signers[5];
        this.minter = this.signers[6];
        this.alice = this.signers[7];

        this.SolarDistributorV2 = await ethers.getContractFactory("SolarDistributorV2");
        this.SolarBeamToken = await ethers.getContractFactory("MockERC20");
        this.ERC20Mock = await ethers.getContractFactory("MockERC20", this.minter);
        this.ComplexRewarderPerSec = await ethers.getContractFactory("ComplexRewarderPerSecV2");

        // this.ERC20Mock = await ethers.getContractFactory("ERC20Mock", this.minter);
        // this.SushiToken = await ethers.getContractFactory("SushiToken");
        // this.MCV1PerBlock = await ethers.getContractFactory("MasterChef");
        // this.MCV1PerSec = await ethers.getContractFactory("MasterChefPerSec");
        // this.MCV2 = await ethers.getContractFactory("MasterChefJoeV2");
        // this.SimpleRewarderPerBlock = await ethers.getContractFactory("SimpleRewarderPerBlock");
        // this.SimpleRewarderPerSec = await ethers.getContractFactory("SimpleRewarderPerSec");
        // this.MasterChefRewarderPerBlock = await ethers.getContractFactory("MasterChefRewarderPerBlock");
        // this.MasterChefRewarderPerSec = await ethers.getContractFactory("MasterChefRewarderPerSec");

        this.devPercent = 200;
        this.treasuryPercent = 200;
        this.investorPercent = 100;
        this.lpPercent = 1000 - this.devPercent - this.treasuryPercent;
        this.solarPerSec = 100;
        this.secOffset = 1;
        this.tokenOffset = 1;
        this.reward = (sec, percent) => (sec * this.solarPerSec * percent) / 1000;

        // Partner MasterChef parameters
        this.partnerDev = this.signers[6];
        this.partnerRewardPerBlock = 40;
        this.partnerRewardPerSec = 40;
        this.partnerStartBlock = 0;
        this.partnerBonusEndBlock = 10;
        this.partnerChefPid = 0;
        this.partnerChefAllocPoint = 100;

        // await disableAutomine();
    });

    beforeEach(async function () {
        this.solar = await this.SolarBeamToken.deploy("Solarbeam Token", "SOLAR", "0");
        await this.solar.deployed();

        // this.partnerToken = await this.SushiToken.deploy(); // b=2
        // await this.partnerToken.deployed();
    });

    context("constructor", function () {
        it("should revert contract creation if team percent don't meet criteria", async function () {
            await expect(this.SolarDistributorV2.deploy(this.solar.address, this.solarPerSec, this.dev.address, this.treasury.address, this.investor.address, "1100", this.treasuryPercent, this.investorPercent)).to.be.revertedWith("constructor: invalid team percent value");
        });

        it("should revert contract creation if treasury percent don't meet criteria", async function () {
            await expect(this.SolarDistributorV2.deploy(this.solar.address, this.solarPerSec, this.dev.address, this.treasury.address, this.investor.address, this.devPercent, "1100", this.investorPercent)).to.be.revertedWith("constructor: invalid treasury percent value");
        });

        it("should revert contract creation if investor percent don't meet criteria", async function () {
            await expect(this.SolarDistributorV2.deploy(this.solar.address, this.solarPerSec, this.dev.address, this.treasury.address, this.investor.address, this.devPercent, this.treasuryPercent, "1100")).to.be.revertedWith("constructor: invalid investor percent value");
        });

        it("should revert contract creation if sum of percents don't meet criteria", async function () {
            await expect(this.SolarDistributorV2.deploy(this.solar.address, this.solarPerSec, this.dev.address, this.treasury.address, this.investor.address, "300", "300", "401")).to.be.revertedWith("constructor: total percent over max");
        });

        it("should set internal variables after deployed", async function () {
            const sdv2 = await this.SolarDistributorV2.deploy(this.solar.address, this.solarPerSec, this.dev.address, this.treasury.address, this.investor.address, this.devPercent, this.treasuryPercent, this.investorPercent);

            const startTimestamp = await sdv2.startTimestamp();
            const solar = await sdv2.solar();
            const solarPerSec = await sdv2.solarPerSec();

            const teamAddress = await sdv2.teamAddress();
            const treasuryAddress = await sdv2.treasuryAddress();
            const investorAddress = await sdv2.investorAddress();

            const teamPercent = await sdv2.teamPercent();
            const treasuryPercent = await sdv2.treasuryPercent();
            const investorPercent = await sdv2.investorPercent();

            const startTime = (await latest()).add(60 * 60 * 24 * 365);

            expect(solar).to.equal(this.solar.address);
            expect(solarPerSec).to.equal(this.solarPerSec);
            expect(startTimestamp).to.equal(startTime);

            expect(teamAddress).to.equal(this.dev.address);
            expect(treasuryAddress).to.equal(this.treasury.address);
            expect(investorAddress).to.equal(this.investor.address);

            expect(teamPercent).to.equal(this.devPercent);
            expect(treasuryPercent).to.equal(this.treasuryPercent);
            expect(investorPercent).to.equal(this.investorPercent);
        });
    });

    context("setters", function () {
        it("should allow team update himself", async function () {
            const sdv2 = await this.SolarDistributorV2.deploy(this.solar.address, this.solarPerSec, this.dev.address, this.treasury.address, this.investor.address, this.devPercent, this.treasuryPercent, this.investorPercent);
            await sdv2.deployed();

            await expect(sdv2.connect(this.bob).setTeamAddress(this.bob.address, { from: this.bob.address })).to.be.revertedWith("set team address: only previous team address can call this method");
            await sdv2.connect(this.dev).setTeamAddress(this.bob.address, { from: this.dev.address });
            expect(await sdv2.teamAddress()).to.equal(this.bob.address);
        });

        it("should allow treasury update himself", async function () {
            const sdv2 = await this.SolarDistributorV2.deploy(this.solar.address, this.solarPerSec, this.dev.address, this.treasury.address, this.investor.address, this.devPercent, this.treasuryPercent, this.investorPercent);
            await sdv2.deployed();

            await expect(sdv2.connect(this.bob).setTreasuryAddress(this.bob.address, { from: this.bob.address })).to.be.revertedWith("set treasury address: only previous treasury address can call this method");
            await sdv2.connect(this.treasury).setTreasuryAddress(this.bob.address, { from: this.treasury.address });
            expect(await sdv2.treasuryAddress()).to.equal(this.bob.address);
        });

        it("should allow investor update himself", async function () {
            const sdv2 = await this.SolarDistributorV2.deploy(this.solar.address, this.solarPerSec, this.dev.address, this.treasury.address, this.investor.address, this.devPercent, this.treasuryPercent, this.investorPercent);
            await sdv2.deployed();

            await expect(sdv2.connect(this.bob).setInvestorAddress(this.bob.address, { from: this.bob.address })).to.be.revertedWith("set investor address: only previous investor can call this method");
            await sdv2.connect(this.investor).setInvestorAddress(this.bob.address, { from: this.investor.address });
            expect(await sdv2.investorAddress()).to.equal(this.bob.address);
        });
    });

    context("distributor", function () {
        beforeEach(async function () {
            this.lp = await this.ERC20Mock.deploy("LPToken", "LP", "10000000000");
            await this.lp.transfer(this.alice.address, "1000");
            await this.lp.transfer(this.bob.address, "1000");
            await this.lp.transfer(this.carol.address, "1000");

            this.lp2 = await this.ERC20Mock.deploy("LPToken2", "LP2", "10000000000");
            await this.lp2.transfer(this.alice.address, "1000");
            await this.lp2.transfer(this.bob.address, "1000");
            await this.lp2.transfer(this.carol.address, "1000");
        });

        it("should distribute SOLAR properly for each staker", async function () {
            this.sdv2 = await this.SolarDistributorV2.deploy(this.solar.address, this.solarPerSec, this.dev.address, this.treasury.address, this.investor.address, this.devPercent, this.treasuryPercent, this.investorPercent);
            await this.sdv2.deployed();

            await this.sdv2.add("100", this.lp.address, 0, 0, []);

            await this.lp.connect(this.alice).approve(this.sdv2.address, "1000", {
                from: this.alice.address,
            });
            await this.lp.connect(this.bob).approve(this.sdv2.address, "1000", {
                from: this.bob.address,
            });
            await this.lp.connect(this.carol).approve(this.sdv2.address, "1000", {
                from: this.carol.address,
            });

            await this.sdv2.startFarming();

            // Alice deposits 10 LPs at t+10
            await advanceTimeAndBlock(1); // t+9, b=22
            await this.sdv2.connect(this.alice).deposit(0, "10", { from: this.alice.address }); // t+10, b=23
            // Bob deposits 20 LPs at t+14
            await advanceTimeAndBlock(3); // t+13, b=24
            await this.sdv2.connect(this.bob).deposit(0, "20"); // t+14, b=25
            // Carol deposits 30 LPs at block t+18
            await advanceTimeAndBlock(3); // t+17, b=26
            await this.sdv2.connect(this.carol).deposit(0, "30", { from: this.carol.address }); // t+18, b=27

            // Alice deposits 10 more LPs at t+20. At this point:
            //   Alice should have:
            //      - 4*50 + 4*50*1/3 + 2*50*1/6 = 283 (+50) SolarBeamToken
            //   Dev should have: 10*20 = 200 (+20)
            //   Treasury should have: 10*20 = 200 (+20)
            //   Investor should have: 10*10 = 100 (+10)
            //   MasterChef should have: 1000 - 283 - 200 - 200 - 100 = 217 (+100)
            await advanceTimeAndBlock(1); // t+19, b=28
            await this.sdv2.connect(this.alice).deposit(0, "10", { from: this.alice.address }); // t+20, b=29
            expect(await this.solar.totalSupply()).to.be.within(1000, 1100);

            // Because LP rewards are divided among participants and rounded down, we account
            // for rounding errors with an offset
            expect(await this.solar.balanceOf(this.alice.address)).to.be.within(283 - this.tokenOffset, 333 + this.tokenOffset);

            expect(await this.solar.balanceOf(this.bob.address)).to.equal("0");

            expect(await this.solar.balanceOf(this.carol.address)).to.equal("0");

            expect(await this.solar.balanceOf(this.dev.address)).to.be.within(200 - this.tokenOffset, 220 + this.tokenOffset);
            expect(await this.solar.balanceOf(this.treasury.address)).to.be.within(200 - this.tokenOffset, 220 + this.tokenOffset);
            expect(await this.solar.balanceOf(this.investor.address)).to.be.within(100 - this.tokenOffset, 110 + this.tokenOffset);
            expect(await this.solar.balanceOf(this.sdv2.address)).to.be.within(217 - this.tokenOffset, 317 + this.tokenOffset);

            // Bob withdraws 5 LPs at t+30. At this point:
            //   Bob should have:
            //     - 4*50*2/3 + 2*50*2/6 + 10*50*2/7 = 309 (+50) SolarBeamToken
            //   Dev should have: 20*20= 400 (+20)
            //   Treasury should have: 20*20 = 400 (+20)
            //   Investor should have: 20*10 = 200 (+10)
            //   SDV2 should have: 217 + 1000 - 309 - 200 - 200 - 100 = 408 (+100)
            await advanceTimeAndBlock(9); // t+29, b=32
            await this.sdv2.connect(this.bob).withdraw(0, "5", { from: this.bob.address }); // t+30, b=33
            expect(await this.solar.totalSupply()).to.be.within(2000, 2100);
            // Because of rounding errors, we use token offsets
            expect(await this.solar.balanceOf(this.alice.address)).to.be.within(283 - this.tokenOffset, 333 + this.tokenOffset);

            expect(await this.solar.balanceOf(this.bob.address)).to.be.within(309 - this.tokenOffset, 359 + this.tokenOffset);

            expect(await this.solar.balanceOf(this.carol.address)).to.equal("0");

            expect(await this.solar.balanceOf(this.dev.address)).to.be.within(400 - this.tokenOffset, 420 + this.tokenOffset);
            expect(await this.solar.balanceOf(this.treasury.address)).to.be.within(400 - this.tokenOffset, 420 + this.tokenOffset);
            expect(await this.solar.balanceOf(this.investor.address)).to.be.within(200 - this.tokenOffset, 210 + this.tokenOffset);
            expect(await this.solar.balanceOf(this.sdv2.address)).to.be.within(408 - this.tokenOffset, 508 + this.tokenOffset);

            // Alice withdraws 20 LPs at t+40
            // Bob withdraws 15 LPs at t+50
            // Carol withdraws 30 LPs at t+60
            await advanceTimeAndBlock(9); // t+39, b=34
            await this.sdv2.connect(this.alice).withdraw(0, "20", { from: this.alice.address }); // t+40, b=35
            await advanceTimeAndBlock(9); // t+49, b=36
            await this.sdv2.connect(this.bob).withdraw(0, "15", { from: this.bob.address }); // t+50, b=37
            await advanceTimeAndBlock(9); // t+59, b=38
            await this.sdv2.connect(this.carol).withdraw(0, "30", { from: this.carol.address }); // t+60, b=39
            expect(await this.solar.totalSupply()).to.be.within(5000, 5100);
            // Alice should have:
            //  - 283 + 10*50*2/7 + 10*50*20/65 = 579 (+50) SolarBeamToken
            //  - 120 + 2*40*2/7 + 2*40*20/65 = 167 PartnerToken
            expect(await this.solar.balanceOf(this.alice.address)).to.be.within(579 - this.tokenOffset, 629 + this.tokenOffset);

            // Bob should have:
            //  - 309 + 10*50*15/65 + 10*50*15/45 = 591 (+50) SolarBeamToken
            //  - 102 + 2*40*15/65 + 2*40*15/45 = 147 PartnerToken
            expect(await this.solar.balanceOf(this.bob.address)).to.be.within(591 - this.tokenOffset, 641 + this.tokenOffset);

            // Carol should have:
            //  - 2*50*3/6 + 10*50*3/7 + 10*50*30/65 + 10*50*30/45 + 10*50 = 1445 (+50) SolarBeamToken
            //  - 2*40*1/2 + 2*40*3/7 + 2*40*30/65 + 2*40*30/45 + 2*40 = 244 PartnerToken
            expect(await this.solar.balanceOf(this.carol.address)).to.be.within(1328 - this.tokenOffset, 1378 + this.tokenOffset);

            // Dev should have: 50*20 = 1000 (+20)
            // Treasury should have: 50*20 = 1000 (+20)
            // Investor should have: 50*10 = 500 (+10)
            expect(await this.solar.balanceOf(this.dev.address)).to.be.within(1000 - this.tokenOffset, 1020 + this.tokenOffset);
            expect(await this.solar.balanceOf(this.treasury.address)).to.be.within(1000 - this.tokenOffset, 1020 + this.tokenOffset);
            expect(await this.solar.balanceOf(this.investor.address)).to.be.within(500 - this.tokenOffset, 510 + this.tokenOffset);
            // SDV2 should have nothing
            expect(await this.solar.balanceOf(this.sdv2.address)).to.be.within(0, 0 + this.tokenOffset);

            // // All of them should have 1000 LPs back.
            expect(await this.lp.balanceOf(this.alice.address)).to.equal("1000");
            expect(await this.lp.balanceOf(this.bob.address)).to.equal("1000");
            expect(await this.lp.balanceOf(this.carol.address)).to.equal("1000");
        });

        it("should give proper SOLAR allocation to each pool", async function () {
            this.sdv2 = await this.SolarDistributorV2.deploy(this.solar.address, this.solarPerSec, this.dev.address, this.treasury.address, this.investor.address, this.devPercent, this.treasuryPercent, this.investorPercent);
            await this.sdv2.deployed(); // t-59, b=14

            await this.lp.connect(this.alice).approve(this.sdv2.address, "1000", { from: this.alice.address }); // t-55, b=18
            await this.lp2.connect(this.bob).approve(this.sdv2.address, "1000", { from: this.bob.address }); // t-54, b=19
            // Add first LP to the pool with allocation 10
            await this.sdv2.add("10", this.lp.address, 0, 0, []);

            await this.sdv2.startFarming();

            //1s
            await this.sdv2.connect(this.alice).deposit(0, "10", { from: this.alice.address }); // t+10, b=22
            // Add LP2 to the pool with allocation 20 at t+20
            await advanceTimeAndBlock(9); // t+19, b=23
            await this.sdv2.add("20", this.lp2.address, 0, 0, []);
            // Alice's pending reward should be:
            //   - 10*50 = 500 (+50) SolarBeamToken
            expect((await this.sdv2.pendingTokens(0, this.alice.address)).amounts[0]).to.be.within(500 - this.tokenOffset, 550 + this.tokenOffset);

            await advanceTimeAndBlock(4); // t+24, b=25
            await this.sdv2.connect(this.bob).deposit(1, "10", { from: this.bob.address }); // t+25, b=26
            // Alice's pending reward should be:
            //   - 500 + 5*1/3*50 = 583 (+50) SolarBeamToken
            expect((await this.sdv2.pendingTokens(0, this.alice.address)).amounts[0]).to.be.within(583 - this.tokenOffset, 633 + this.tokenOffset);

            // At this point:
            //   Alice's pending reward should be:
            //     - 583 + 5*1/3*50 = 666 (+50) SolarBeamToken
            // Bob's pending reward should be:
            //     - 5*2/3*50 = 166 (+50) SolarBeamToken
            await advanceTimeAndBlock(5); // t+30, b=27
            expect((await this.sdv2.pendingTokens(0, this.alice.address)).amounts[0]).to.be.within(666 - this.tokenOffset, 716 + this.tokenOffset);
            expect((await this.sdv2.pendingTokens(1, this.bob.address)).amounts[0]).to.be.within(166 - this.tokenOffset, 216 + this.tokenOffset);
            expect((await this.sdv2.pendingTokens(1, this.alice.address)).amounts[0]).to.equal("0");
            expect((await this.sdv2.pendingTokens(0, this.bob.address)).amounts[0]).to.equal("0");

            // Make sure they have receive the same amount as what was pending
            await this.sdv2.connect(this.alice).withdraw(0, "10", { from: this.alice.address }); // t+31, b=28
            // Alice should have:
            //   - 666 + 1*1/3*50 = 682 (+50) SolarBeamToken
            expect(await this.solar.balanceOf(this.alice.address)).to.be.within(682 - this.tokenOffset, 732 + this.tokenOffset);

            await this.sdv2.connect(this.bob).withdraw(1, "5", { from: this.bob.address }); // t+32, b=29
            // Bob should have:
            //   - 166 + 2*2/3*50 = 232 (+50) SolarBeamToken
            expect(await this.solar.balanceOf(this.bob.address)).to.be.within(232 - this.tokenOffset, 282 + this.tokenOffset);
        });
    });

    context("rewarder", function () {
        beforeEach(async function () {
            this.partnerToken = await this.ERC20Mock.deploy("Reward", "RWD", "10000000000");
            await this.partnerToken.transfer(this.deployer.address, "1000");

            this.lp = await this.ERC20Mock.deploy("LPToken", "LP", "10000000000");
            await this.lp.transfer(this.alice.address, "1000");
            await this.lp.transfer(this.bob.address, "1000");
            await this.lp.transfer(this.carol.address, "1000");

            this.lp2 = await this.ERC20Mock.deploy("LPToken2", "LP2", "10000000000");
            await this.lp2.transfer(this.alice.address, "1000");
            await this.lp2.transfer(this.bob.address, "1000");
            await this.lp2.transfer(this.carol.address, "1000");
        });

        it("should decrease partner token amount after decreasing rewardPerSec", async function () {
            this.sdv2 = await this.SolarDistributorV2.deploy(this.solar.address, this.solarPerSec, this.dev.address, this.treasury.address, this.investor.address, this.devPercent, this.treasuryPercent, this.investorPercent);
            await this.sdv2.deployed();
            await this.sdv2.startFarming();

            this.rewarder = await this.ComplexRewarderPerSec.deploy(this.partnerToken.address, this.sdv2.address, false);
            await this.rewarder.deployed();
            await this.partnerToken.connect(this.deployer).approve(this.rewarder.address, "1000");

            await this.sdv2.add("100", this.lp.address, 0, 15, [this.rewarder.address]);

            //deposit for bob
            await this.lp.connect(this.bob).approve(this.sdv2.address, "1000");
            await this.sdv2.connect(this.bob).deposit(0, "100");

            //deposit for alice
            await this.lp.connect(this.alice).approve(this.sdv2.address, "1000");
            await this.sdv2.connect(this.alice).deposit(0, "100");

            const starting = await latest();
            await this.rewarder.add(0, "100", starting.add(3)); //+1 - T = 0

            await this.rewarder.addRewardInfo(0, starting.add(5), this.partnerRewardPerSec); //+2 - ET = T + 2 = 2

            //add 40 * 2 = 80 tokens as reward
            expect(await this.partnerToken.balanceOf(this.rewarder.address)).to.equal(80);

            await this.rewarder.setRewardInfo(0, 0, starting.add(5), this.partnerRewardPerSec / 2, this.treasury.address); //+3 - ET = T + 2 = 2

            //add 20 * 2 = 40 tokens as reward
            expect(await this.partnerToken.balanceOf(this.rewarder.address)).to.equal(40);

            //refund 40
            expect(await this.partnerToken.balanceOf(this.treasury.address)).to.equal(40);

            await advanceTimeAndBlock(1); //Bob = T+1 <= ET = (80 / 2) * (ET - T+1) = (40 / 2) * (1) = 10
            await advanceTimeAndBlock(1); //Bob = T+2 <= ET = (80 / 2) * (ET - T+2) = (40 / 2) * (2) = 20
            await advanceTimeAndBlock(1); //Bob = T+3 > ET = 20
            await advanceTimeAndBlock(1); //Bob = T+4 > ET = 20

            // Bob should have:
            //   - 0 SolarBeamToken
            //   - 20 PartnerToken
            // Alice should have:
            //   - 0 SolarBeamToken
            //   - 20 PartnerToken pending
            await this.sdv2.connect(this.bob).deposit(0, 0); //T+5
            expect(await this.partnerToken.balanceOf(this.bob.address)).to.equal(20);
            expect(await this.rewarder.pendingTokens("0", this.alice.address)).to.equal(20);
        });

        it("should increase partner token amount after increasing rewardPerSec", async function () {
            this.sdv2 = await this.SolarDistributorV2.deploy(this.solar.address, this.solarPerSec, this.dev.address, this.treasury.address, this.investor.address, this.devPercent, this.treasuryPercent, this.investorPercent);
            await this.sdv2.deployed();
            await this.sdv2.startFarming();

            this.rewarder = await this.ComplexRewarderPerSec.deploy(this.partnerToken.address, this.sdv2.address, false);
            await this.rewarder.deployed();
            await this.partnerToken.connect(this.deployer).approve(this.rewarder.address, "1000");

            await this.sdv2.add("100", this.lp.address, 0, 15, [this.rewarder.address]);

            //deposit for bob
            await this.lp.connect(this.bob).approve(this.sdv2.address, "1000");
            await this.sdv2.connect(this.bob).deposit(0, "100");

            //deposit for alice
            await this.lp.connect(this.alice).approve(this.sdv2.address, "1000");
            await this.sdv2.connect(this.alice).deposit(0, "100");

            const starting = await latest();
            await this.rewarder.add(0, "100", starting.add(3)); //+1 - T = 0

            await this.rewarder.addRewardInfo(0, starting.add(5), this.partnerRewardPerSec); //+2 - ET = T + 2 = 2

            //add 40 * 2 = 80 tokens as reward
            expect(await this.partnerToken.balanceOf(this.rewarder.address)).to.equal(80);

            await this.rewarder.setRewardInfo(0, 0, starting.add(5), this.partnerRewardPerSec * 2, this.deployer.address); //+3 - ET = T + 2 = 2

            //add 80 * 2 = 160 tokens as reward
            expect(await this.partnerToken.balanceOf(this.rewarder.address)).to.equal(160);

            await advanceTimeAndBlock(1); //Bob = T+1 <= ET = (80 / 2) * (ET - T+1) = (80 / 2) * (1) = 40
            await advanceTimeAndBlock(1); //Bob = T+2 <= ET = (80 / 2) * (ET - T+2) = (80 / 2) * (2) = 80
            await advanceTimeAndBlock(1); //Bob = T+3 > ET = 80
            await advanceTimeAndBlock(1); //Bob = T+4 > ET = 80

            // Bob should have:
            //   - 0 SolarBeamToken
            //   - 80 PartnerToken
            // Alice should have:
            //   - 0 SolarBeamToken
            //   - 80 PartnerToken pending
            await this.sdv2.connect(this.bob).deposit(0, 0); //T+5
            expect(await this.partnerToken.balanceOf(this.bob.address)).to.equal(80);
            expect(await this.rewarder.pendingTokens("0", this.alice.address)).to.equal(80);
        });

        it("should increase partner token amount and endTimestamp after increasing rewardPerSec and endTimestamp during active rewardInfo", async function () {
            this.sdv2 = await this.SolarDistributorV2.deploy(this.solar.address, this.solarPerSec, this.dev.address, this.treasury.address, this.investor.address, this.devPercent, this.treasuryPercent, this.investorPercent);
            await this.sdv2.deployed();
            await this.sdv2.startFarming();

            this.rewarder = await this.ComplexRewarderPerSec.deploy(this.partnerToken.address, this.sdv2.address, false);
            await this.rewarder.deployed();
            await this.partnerToken.connect(this.deployer).approve(this.rewarder.address, "1000");

            await this.sdv2.add("100", this.lp.address, 0, 15, [this.rewarder.address]);

            //deposit for bob
            await this.lp.connect(this.bob).approve(this.sdv2.address, "1000");
            await this.sdv2.connect(this.bob).deposit(0, "100");

            //deposit for alice
            await this.lp.connect(this.alice).approve(this.sdv2.address, "1000");
            await this.sdv2.connect(this.alice).deposit(0, "100");

            const starting = await latest();
            await this.rewarder.add(0, "100", starting.add(2)); //+1 - T = 0
            // console.log("ts: %s - starting on: %s", (await latest()).toNumber(), starting.add(2).toNumber());

            await this.rewarder.addRewardInfo(0, starting.add(4), this.partnerRewardPerSec); //+2 - ET = T + 2 = 2

            //add 40 * 2 = 80 tokens as reward
            expect(await this.partnerToken.balanceOf(this.rewarder.address)).to.equal(80);

            await advanceTimeAndBlock(1); //+3 - Bob = T+1 <= ET = (40 / 2) * (ET - T+1) = (40 / 2) * (1) = 20

            //still 1s to end
            //timeRange = 4 - 3;
            //pendingRewards = 1 * 40;
            //newTimeRange = 10 - 3;
            //newPendingRewards = 7 * 40;
            //for this timeRange (7s) we need (7 * 40) tokens in total and we have already 40 tokens
            //280 tokens - 40 tokens = +240 - total in rewarder address will be (80 pending + 240) = 320
            await this.rewarder.setRewardInfo(0, 0, starting.add(10), this.partnerRewardPerSec, this.deployer.address); //+4
            expect(await this.partnerToken.balanceOf(this.rewarder.address)).to.equal(320);

            await advanceTimeAndBlock(1); //+5 - Bob = T+3 <= ET = (40 / 2) * (ET - T+3) = 20 * (3) = 60
            await advanceTimeAndBlock(1); //+6 - Bob = T+4 <= ET = (40 / 2) * (ET - T+4) = 20 * (4) = 80
            await advanceTimeAndBlock(1); //+7 - Bob = T+5 <= ET = (40 / 2) * (ET - T+5) = 20 * (5) = 100
            await advanceTimeAndBlock(1); //+8 - Bob = T+6 <= ET = (40 / 2) * (ET - T+6) = 20 * (6) = 120
            await advanceTimeAndBlock(1); //+9 - Bob = T+7 <= ET = (40 / 2) * (ET - T+7) = 20 * (7) = 140
            await advanceTimeAndBlock(1); //+10 - Bob = T+8 <= ET = (40 / 2) * (ET - T+8) = 20 * (8) = 160
            await advanceTimeAndBlock(1); //+11 - Bob = T+9 > ET = 160

            // Bob should have:
            //   - 0 SolarBeamToken
            //   - 160 PartnerToken
            // Alice should have:
            //   - 0 SolarBeamToken
            //   - 160 PartnerToken pending
            await this.sdv2.connect(this.bob).deposit(0, 0); //T+5
            expect(await this.partnerToken.balanceOf(this.bob.address)).to.equal(160);
            expect(await this.rewarder.pendingTokens("0", this.alice.address)).to.equal(160);
        });

        it("should decrease partner token amount and endTimestamp after decreasing endTimestamp during active rewardInfo", async function () {
            this.sdv2 = await this.SolarDistributorV2.deploy(this.solar.address, this.solarPerSec, this.dev.address, this.treasury.address, this.investor.address, this.devPercent, this.treasuryPercent, this.investorPercent);
            await this.sdv2.deployed();
            await this.sdv2.startFarming();

            this.rewarder = await this.ComplexRewarderPerSec.deploy(this.partnerToken.address, this.sdv2.address, false);
            await this.rewarder.deployed();
            await this.partnerToken.connect(this.deployer).approve(this.rewarder.address, "1000");

            await this.sdv2.add("100", this.lp.address, 0, 15, [this.rewarder.address]);

            //deposit for bob
            await this.lp.connect(this.bob).approve(this.sdv2.address, "1000");
            await this.sdv2.connect(this.bob).deposit(0, "100");

            //deposit for alice
            await this.lp.connect(this.alice).approve(this.sdv2.address, "1000");
            await this.sdv2.connect(this.alice).deposit(0, "100");

            const starting = await latest();
            await this.rewarder.add(0, "100", starting.add(2)); //+1 - T = 0
            // console.log("ts: %s - starting on: %s", (await latest()).toNumber(), starting.add(2).toNumber());

            await this.rewarder.addRewardInfo(0, starting.add(5), this.partnerRewardPerSec); //+2 - ET = T + 3 = 3

            //add 40 * 3 = 120 tokens as reward
            expect(await this.partnerToken.balanceOf(this.rewarder.address)).to.equal(120);

            await advanceTimeAndBlock(1); //+3 - Bob = T+1 <= ET = (40 / 2) * (ET - T+1) = (40 / 2) * (1) = 20

            //still 2s to end
            //decreasing 1s
            //timeRange = 5 - 3;
            //pendingRewards = 2 * 40;
            //newTimeRange = 4 - 3;
            //newPendingRewards = 1 * 40;
            //for this timeRange (1s) we will need  (40) tokens in total and we have already 80 tokens
            //it should refund in 40 tokens and stop giving tokens
            await this.rewarder.setRewardInfo(0, 0, starting.add(4), this.partnerRewardPerSec, this.treasury.address); //+4
            expect(await this.partnerToken.balanceOf(this.rewarder.address)).to.equal(80);
            expect(await this.partnerToken.balanceOf(this.treasury.address)).to.equal(40);

            await advanceTimeAndBlock(1); //+5 - Bob = T+3 > ET = 40
            await advanceTimeAndBlock(1); //+6 - Bob = T+4 > ET = 40

            // Bob should have:
            //   - 0 SolarBeamToken
            //   - 40 PartnerToken
            // Alice should have:
            //   - 0 SolarBeamToken
            //   - 40 PartnerToken pending
            await this.sdv2.connect(this.bob).deposit(0, 0); //T+5
            expect(await this.partnerToken.balanceOf(this.bob.address)).to.equal(40);
            expect(await this.rewarder.pendingTokens("0", this.alice.address)).to.equal(40);
        });

        it("should reward partner token accurately with 1 reward info after rewards run out", async function () {
            this.sdv2 = await this.SolarDistributorV2.deploy(this.solar.address, this.solarPerSec, this.dev.address, this.treasury.address, this.investor.address, this.devPercent, this.treasuryPercent, this.investorPercent);
            await this.sdv2.deployed();
            await this.sdv2.startFarming();

            this.rewarder = await this.ComplexRewarderPerSec.deploy(this.partnerToken.address, this.sdv2.address, false);
            await this.rewarder.deployed();
            await this.partnerToken.connect(this.deployer).approve(this.rewarder.address, "1000");

            await this.sdv2.add("100", this.lp.address, 0, 15, [this.rewarder.address]);

            //deposit for bob
            await this.lp.connect(this.bob).approve(this.sdv2.address, "1000");
            await this.sdv2.connect(this.bob).deposit(0, "100");

            //deposit for alice
            await this.lp.connect(this.alice).approve(this.sdv2.address, "1000");
            await this.sdv2.connect(this.alice).deposit(0, "100");

            const starting = await latest();
            await this.rewarder.add(0, "100", starting.add(2)); //T = 0

            await this.rewarder.addRewardInfo(0, starting.add(12), this.partnerRewardPerSec); //ET = T + 10 = 10

            //add 40 * 10 = 400 tokens as reward
            expect(await this.partnerToken.balanceOf(this.rewarder.address)).to.equal(400);

            await advanceTimeAndBlock(1); //Bob = T+1 <= ET = (40 / 2) * (ET - T+1) = (40 / 2) * (1) = 20
            await this.sdv2.connect(this.bob).deposit(0, 0); //Bob = T+2 <= ET = (40 / 2) * (ET - T+2) = (40 / 2) * (2) = 40
            expect(await this.partnerToken.balanceOf(this.bob.address)).to.equal(40);

            await advanceTimeAndBlock(1); //Bob = T+1 <= ET = (40 / 2) * (ET - T+2) = (40 / 2) * (1) = 20
            await advanceTimeAndBlock(1); //Bob = T+2 <= ET = (40 / 2) * (ET - T+2) = (40 / 2) * (2) = 40
            await advanceTimeAndBlock(1); //Bob = T+3 <= ET = (40 / 2) * (ET - T+2) = (40 / 2) * (3) = 60

            await this.sdv2.connect(this.bob).deposit(0, 0); //Bob = T+4 <= ET = (40 / 2) * (ET - T+2) = (40 / 2) * (4) = 80
            expect(await this.partnerToken.balanceOf(this.bob.address)).to.equal(40 + 80);

            // Bob should have:
            //   - 0 SolarBeamToken
            //   - 120 PartnerToken
            // Alice should have:
            //   - 0 SolarBeamToken
            //   - 120 PartnerToken pending
            expect(await this.rewarder.pendingTokens("0", this.alice.address)).to.equal(120);
        });
    });

    after(async function () {
        await network.provider.request({
            method: "hardhat_reset",
            params: [],
        });
    });

    // context("With ERC/LP token added to the field and using SimpleRewarderPerBlock", function () {
    //     beforeEach(async function () {
    //         this.lp = await this.ERC20Mock.deploy("LPToken", "LP", "10000000000"); // b=3
    //         await this.lp.transfer(this.alice.address, "1000"); // b=4
    //         await this.lp.transfer(this.bob.address, "1000"); // b=5
    //         await this.lp.transfer(this.carol.address, "1000"); // b=6

    //         this.lp2 = await this.ERC20Mock.deploy("LPToken2", "LP2", "10000000000"); // b=7
    //         await this.lp2.transfer(this.alice.address, "1000"); // b=8
    //         await this.lp2.transfer(this.bob.address, "1000"); // b=9
    //         await this.lp2.transfer(this.carol.address, "1000"); // b=10
    //     });

    //     it("should check rewarder's arguments are contracts", async function () {
    //         await expect(this.SimpleRewarderPerBlock.deploy(ADDRESS_ZERO, this.lp.address, this.partnerRewardPerBlock, this.chef.address)).to.be.revertedWith("constructor: reward token must be a valid contract");

    //         await expect(this.SimpleRewarderPerBlock.deploy(this.partnerToken.address, ADDRESS_ZERO, this.partnerRewardPerBlock, this.chef.address)).to.be.revertedWith("constructor: LP token must be a valid contract");

    //         await expect(this.SimpleRewarderPerBlock.deploy(this.partnerToken.address, this.lp.address, this.partnerRewardPerBlock, ADDRESS_ZERO)).to.be.revertedWith("constructor: MasterChefJoeV2 must be a valid contract");
    //     });

    //     it("should check rewarder added and set properly", async function () {
    //         const startTime = (await latest()).add(60);
    //         this.chef = await this.MCV2.deploy(this.solar.address, this.dev.address, this.treasury.address, this.investor.address, this.solarPerSec, startTime, this.devPercent, this.treasuryPercent, this.investorPercent);
    //         await this.chef.deployed();

    //         this.rewarder = await this.SimpleRewarderPerBlock.deploy(this.solar.address, this.lp.address, this.partnerRewardPerBlock, this.chef.address);
    //         await this.rewarder.deployed();

    //         // Try to add rewarder that is neither zero address or contract address
    //         await expect(this.chef.add("100", this.lp.address, this.dev.address)).to.be.revertedWith("add: rewarder must be contract or zero");

    //         await this.chef.add("100", this.lp.address, this.rewarder.address);

    //         // Try to set rewarder that is neither zero address or contract address
    //         await expect(this.chef.set("0", "200", this.dev.address, true)).to.be.revertedWith("set: rewarder must be contract or zero");

    //         await this.chef.set("0", "200", this.rewarder.address, false);
    //         expect((await this.chef.poolInfo(0)).allocPoint).to.equal("200");
    //     });

    //     it("should allow a given pool's allocation weight and rewarder to be updated", async function () {
    //         const startTime = (await latest()).add(60);
    //         this.chef = await this.MCV2.deploy(this.solar.address, this.dev.address, this.treasury.address, this.investor.address, this.solarPerSec, startTime, this.devPercent, this.treasuryPercent, this.investorPercent);
    //         await this.chef.deployed();

    //         this.rewarder = await this.SimpleRewarderPerBlock.deploy(this.solar.address, this.lp.address, this.partnerRewardPerBlock, this.chef.address);
    //         await this.rewarder.deployed();

    //         await this.chef.add("100", this.lp.address, ADDRESS_ZERO);
    //         expect((await this.chef.poolInfo(0)).allocPoint).to.equal("100");
    //         expect((await this.chef.poolInfo(0)).rewarder).to.equal(ADDRESS_ZERO);

    //         await this.chef.set("0", "150", this.rewarder.address, true);
    //         expect((await this.chef.poolInfo(0)).allocPoint).to.equal("150");
    //         expect((await this.chef.poolInfo(0)).rewarder).to.equal(this.rewarder.address);
    //     });

    //     it("should allow emergency withdraw from MasterChefJoeV2", async function () {
    //         const startTime = (await latest()).add(60);
    //         this.chef = await this.MCV2.deploy(this.solar.address, this.dev.address, this.treasury.address, this.investor.address, this.solarPerSec, startTime, this.devPercent, this.treasuryPercent, this.investorPercent);
    //         await this.chef.deployed();

    //         await this.chef.add("100", this.lp.address, ADDRESS_ZERO);

    //         await this.lp.connect(this.bob).approve(this.chef.address, "1000");

    //         await this.chef.connect(this.bob).deposit(0, "100");

    //         expect(await this.lp.balanceOf(this.bob.address)).to.equal("900");

    //         await this.chef.connect(this.bob).emergencyWithdraw(0);

    //         expect(await this.lp.balanceOf(this.bob.address)).to.equal("1000");
    //     });

    //     it("should allow emergency withdraw from rewarder contract", async function () {
    //         this.rewarder = await this.SimpleRewarderPerBlock.deploy(this.partnerToken.address, this.lp.address, this.partnerRewardPerBlock, this.chef.address);
    //         await this.rewarder.deployed();

    //         await this.partnerToken.mint(this.rewarder.address, "1000000");
    //         await this.rewarder.emergencyWithdraw();
    //         expect(await this.partnerToken.balanceOf(this.alice.address)).to.equal("1000000");
    //     });

    //     it("should reward partner token accurately after rewarder runs out of tokens and is topped up again", async function () {
    //         const startTime = (await latest()).add(60);
    //         this.chef = await this.MCV2.deploy(this.solar.address, this.dev.address, this.treasury.address, this.investor.address, this.solarPerSec, startTime, this.devPercent, this.treasuryPercent, this.investorPercent);
    //         await this.chef.deployed(); // t-59, b=14

    //         this.rewarder = await this.SimpleRewarderPerBlock.deploy(this.partnerToken.address, this.lp.address, this.partnerRewardPerBlock, this.chef.address);
    //         await this.rewarder.deployed(); // t-58, b=15

    //         await this.partnerToken.mint(this.rewarder.address, "80"); // t-57, b=16

    //         await this.solar.transferOwnership(this.chef.address); // t-56, b=17

    //         await this.chef.add("100", this.lp.address, this.rewarder.address); // t-55, b=18

    //         await this.lp.connect(this.bob).approve(this.chef.address, "1000"); // t-54, b=19
    //         await this.chef.connect(this.bob).deposit(0, "100"); // t-53, b=20
    //         await advanceTimeAndBlock(1); // t-52, b=21
    //         await advanceTimeAndBlock(1); // t-51, b=22
    //         await advanceTimeAndBlock(1); // t-50, b=23
    //         await advanceTimeAndBlock(1); // t-49, b=24

    //         await this.chef.connect(this.bob).deposit(0, "0"); // t-48, b=25
    //         // Bob should have:
    //         //   - 0 SolarBeamToken
    //         //   - 80 PartnerToken
    //         expect(await this.partnerToken.balanceOf(this.bob.address)).to.equal(80);
    //         await advanceTimeAndBlock(1); // t-47, b=26
    //         await advanceTimeAndBlock(1); // t-46, b=27
    //         await advanceTimeAndBlock(1); // t-45, b=28
    //         await advanceTimeAndBlock(1); // t-44, b=29
    //         await advanceTimeAndBlock(1); // t-43, b=30

    //         await this.partnerToken.mint(this.rewarder.address, "1000"); // t-42, b=31
    //         await advanceTimeAndBlock(1); // t-41, b=32
    //         await advanceTimeAndBlock(1); // t-40, b=33
    //         await advanceTimeAndBlock(1); // t-39, b=34
    //         await advanceTimeAndBlock(1); // t-38, b=35
    //         await advanceTimeAndBlock(1); // t-37, b=36

    //         await this.chef.connect(this.bob).deposit(0, "0"); // t-36, b=37

    //         // Bob should have:
    //         //   - 0 SolarBeamToken
    //         //   - 80 + 12*40 = 560 (+40) PartnerToken
    //         expect(await this.partnerToken.balanceOf(this.bob.address)).to.be.within(560, 600);
    //     });

    //     it("should only allow MasterChefJoeV2 to call onJoeReward", async function () {
    //         const startTime = (await latest()).add(60);
    //         this.chef = await this.MCV2.deploy(this.solar.address, this.dev.address, this.treasury.address, this.investor.address, this.solarPerSec, startTime, this.devPercent, this.treasuryPercent, this.investorPercent);
    //         await this.chef.deployed(); // t-59, b=14

    //         this.rewarder = await this.SimpleRewarderPerBlock.deploy(this.partnerToken.address, this.lp.address, this.partnerRewardPerBlock, this.chef.address);
    //         await this.rewarder.deployed(); // t-58, b=15

    //         await this.partnerToken.mint(this.rewarder.address, "1000000000000000000000000"); // t-57, b=16

    //         await this.solar.transferOwnership(this.chef.address); // t-56, b=17
    //         await this.chef.setDevPercent(this.devPercent); // t-55, b=18
    //         await this.chef.setTreasuryPercent(this.treasuryPercent); // t-54, b=19

    //         await this.chef.add("100", this.lp.address, this.rewarder.address); // t-53, b=20

    //         await this.lp.connect(this.bob).approve(this.chef.address, "1000"); // t-52, b=21
    //         await this.chef.connect(this.bob).deposit(0, "100"); // t-51, b=22
    //         await advanceTimeAndBlock(40); // t-11, b=23

    //         await expect(this.rewarder.onJoeReward(this.bob.address, "100")).to.be.revertedWith("onlyMCV2: only MasterChef V2 can call this function"); // t-10, b=24
    //         await this.chef.connect(this.bob).deposit(0, "0"); // t-9, b=25
    //         // Bob should have:
    //         //   - 0 SolarBeamToken
    //         //   - 3*40 = 80 PartnerToken
    //         expect(await this.solar.balanceOf(this.bob.address)).to.equal("0");
    //         expect(await this.partnerToken.balanceOf(this.bob.address)).to.equal("120");
    //     });

    //     it("should allow rewarder to be set and removed mid farming", async function () {
    //         const startTime = (await latest()).add(60);
    //         this.chef = await this.MCV2.deploy(this.solar.address, this.dev.address, this.treasury.address, this.investor.address, this.solarPerSec, startTime, this.devPercent, this.treasuryPercent, this.investorPercent);
    //         await this.chef.deployed(); // t-59, b=14

    //         this.rewarder = await this.SimpleRewarderPerBlock.deploy(this.partnerToken.address, this.lp.address, this.partnerRewardPerBlock, this.chef.address);
    //         await this.rewarder.deployed(); // t-58, b=15

    //         await this.partnerToken.mint(this.rewarder.address, "1000000000000000000000000"); // t-57, b=16

    //         await this.solar.transferOwnership(this.chef.address); // t-56, b=17

    //         await this.chef.add("100", this.lp.address, ADDRESS_ZERO); // t-55, b=18

    //         await this.lp.connect(this.bob).approve(this.chef.address, "1000"); // t-54, b=19
    //         await this.chef.connect(this.bob).deposit(0, "100"); // t-53, b=20
    //         await advanceTimeAndBlock(42); // t-11, b=21

    //         await this.chef.connect(this.bob).deposit(0, "0"); // t-10, b=24
    //         expect(await this.solar.balanceOf(this.bob.address)).to.equal("0");
    //         // At t+10, Bob should have pending:
    //         //   - 10*50 = 500 (+50) SolarBeamToken
    //         //   - 0 PartnerToken
    //         await advanceTimeAndBlock(20); // t+10, b=25
    //         expect((await this.chef.pendingTokens(0, this.bob.address)).pendingJoe).to.be.within(500, 550);
    //         expect((await this.chef.pendingTokens(0, this.bob.address)).bonusTokenAddress).to.equal(ADDRESS_ZERO);
    //         expect((await this.chef.pendingTokens(0, this.bob.address)).pendingBonusToken).to.equal(0);

    //         // Pass rewarder but don't overwrite
    //         await this.chef.set(0, 100, this.rewarder.address, false); // t+11 ,b=26

    //         // At t+20, Bob should have pending:
    //         //   - 500 + 10*50 = 1000 (+50) SolarBeamToken
    //         //   - 0 PartnerToken
    //         await advanceTimeAndBlock(9); // t+20, b=27
    //         expect((await this.chef.pendingTokens(0, this.bob.address)).pendingJoe).to.be.within(1000, 1050);
    //         expect((await this.chef.pendingTokens(0, this.bob.address)).bonusTokenAddress).to.equal(ADDRESS_ZERO);
    //         expect((await this.chef.pendingTokens(0, this.bob.address)).pendingBonusToken).to.equal(0);

    //         // Pass rewarder and overwrite
    //         await this.chef.set(0, 100, this.rewarder.address, true); // t+21, b=28

    //         // At t+30, Bob should have pending:
    //         //   - 1000 + 10*50 = 1500 (+50) SolarBeamToken
    //         //   - 0 PartnerToken - this is because rewarder hasn't registered the user yet! User needs to call deposit again
    //         await advanceTimeAndBlock(4); // t+25, b=29
    //         await advanceTimeAndBlock(5); // t+30, b=30
    //         expect((await this.chef.pendingTokens(0, this.bob.address)).pendingJoe).to.be.within(1500, 1550);
    //         expect((await this.chef.pendingTokens(0, this.bob.address)).bonusTokenAddress).to.equal(this.partnerToken.address);
    //         expect((await this.chef.pendingTokens(0, this.bob.address)).bonusTokenSymbol).to.equal("SUSHI");
    //         expect((await this.chef.pendingTokens(0, this.bob.address)).pendingBonusToken).to.equal(0);

    //         // Call deposit to start receiving PartnerTokens
    //         await this.chef.connect(this.bob).deposit(0, 0); // t+31, b=31

    //         // At t+40, Bob should have pending:
    //         //   - 9*50 = 450 (+50) SolarBeamToken
    //         //   - 2*40 = 80 PartnerToken
    //         await advanceTimeAndBlock(4); // t+35, b=32
    //         await advanceTimeAndBlock(5); // t+40, b=33
    //         expect((await this.chef.pendingTokens(0, this.bob.address)).pendingJoe).to.be.within(450, 500);
    //         expect((await this.chef.pendingTokens(0, this.bob.address)).bonusTokenAddress).to.equal(this.partnerToken.address);
    //         expect((await this.chef.pendingTokens(0, this.bob.address)).bonusTokenSymbol).to.equal("SUSHI");
    //         expect((await this.chef.pendingTokens(0, this.bob.address)).pendingBonusToken).to.equal(80);

    //         // Set reward rate to zero
    //         await this.rewarder.setRewardRate(0); // t+41, b=34

    //         // At t+50, Bob should have pending:
    //         //   - 450 + 10*50 = 950 (+50) SolarBeamToken
    //         //   - 80 + 1*40 = 120 PartnerToken
    //         await advanceTimeAndBlock(4); // t+45, b=35
    //         await advanceTimeAndBlock(5); // t+50, b=36
    //         expect((await this.chef.pendingTokens(0, this.bob.address)).pendingJoe).to.be.within(950, 1000);
    //         expect((await this.chef.pendingTokens(0, this.bob.address)).bonusTokenAddress).to.equal(this.partnerToken.address);
    //         expect((await this.chef.pendingTokens(0, this.bob.address)).bonusTokenSymbol).to.equal("SUSHI");
    //         expect((await this.chef.pendingTokens(0, this.bob.address)).pendingBonusToken).to.equal(120);

    //         // Claim reward
    //         await this.chef.connect(this.bob).deposit(0, 0); // t+51, b=37

    //         // Bob should have:
    //         //   - 1500 + 1*50 + 950 + 1*50 = 2550 (+50) SolarBeamToken
    //         //   - 120 PartnerToken
    //         expect(await this.solar.balanceOf(this.bob.address)).to.be.within(2550, 2600);
    //         expect(await this.partnerToken.balanceOf(this.bob.address)).to.equal(120);
    //     });

    //     it("should give out JOEs only after farming time", async function () {
    //         const startTime = (await latest()).add(60);
    //         this.chef = await this.MCV2.deploy(this.solar.address, this.dev.address, this.treasury.address, this.investor.address, this.solarPerSec, startTime, this.devPercent, this.treasuryPercent, this.investorPercent);
    //         await this.chef.deployed(); // t-59, b=14

    //         this.rewarder = await this.SimpleRewarderPerBlock.deploy(this.partnerToken.address, this.lp.address, this.partnerRewardPerBlock, this.chef.address);
    //         await this.rewarder.deployed(); // t-58, b=15

    //         await this.partnerToken.mint(this.rewarder.address, "1000000000000000000000000"); // t-57, b=16

    //         await this.solar.transferOwnership(this.chef.address); // t-56, b=17

    //         await this.chef.add("100", this.lp.address, this.rewarder.address); // t-55, b=18

    //         await this.lp.connect(this.bob).approve(this.chef.address, "1000"); // t-54, b=19
    //         await this.chef.connect(this.bob).deposit(0, "100"); // t-53, b=20
    //         await advanceTimeAndBlock(42); // t-11, b=21

    //         await this.chef.connect(this.bob).deposit(0, "0"); // t-10, b=22
    //         // Bob should have:
    //         //   - 0 SolarBeamToken
    //         //   - 2*40 = 80 PartnerToken
    //         expect(await this.solar.balanceOf(this.bob.address)).to.equal("0");
    //         expect(await this.partnerToken.balanceOf(this.bob.address)).to.equal("80");
    //         await advanceTimeAndBlock(8); // t-2, b=23

    //         await this.chef.connect(this.bob).deposit(0, "0"); // t-1, b=24
    //         expect(await this.solar.balanceOf(this.bob.address)).to.equal("0");
    //         await advanceTimeAndBlock(10); // t+9, b=25

    //         await this.chef.connect(this.bob).deposit(0, "0"); // t+10, b=26
    //         // Bob should have:
    //         //   - 10*50 = 500 (+50) SolarBeamToken
    //         //   - 80 + 4*40 = 240 PartnerToken
    //         expect(await this.solar.balanceOf(this.bob.address)).to.be.within(500, 550);
    //         expect(await this.partnerToken.balanceOf(this.bob.address)).to.equal("240");

    //         await advanceTimeAndBlock(4); // t+14, b=27
    //         await this.chef.connect(this.bob).deposit(0, "0"); // t+15, b=28

    //         // At this point:
    //         //   Bob should have:
    //         //     - 500 + 5*50 = 750 (+50) SolarBeamToken
    //         //     - 240 + 2*40 = 320 PartnerToken
    //         //   Dev should have: 15*20 = 300 (+20)
    //         //   Treasury should have: 15*20 = 300 (+20)
    //         //   Investor should have: 15*10 = 150 (+10)
    //         expect(await this.solar.balanceOf(this.bob.address)).to.be.within(750, 800);
    //         expect(await this.partnerToken.balanceOf(this.bob.address)).to.equal("320");
    //         expect(await this.solar.balanceOf(this.dev.address)).to.be.within(300, 320);
    //         expect(await this.solar.balanceOf(this.treasury.address)).to.be.within(300, 320);
    //         expect(await this.solar.balanceOf(this.investor.address)).to.be.within(150, 160);
    //         expect(await this.solar.totalSupply()).to.be.within(1500, 1600);
    //     });

    //     it("should not distribute JOEs if no one deposit", async function () {
    //         const startTime = (await latest()).add(60);
    //         this.chef = await this.MCV2.deploy(this.solar.address, this.dev.address, this.treasury.address, this.investor.address, this.solarPerSec, startTime, this.devPercent, this.treasuryPercent, this.investorPercent);
    //         await this.chef.deployed(); // t-59, b=14

    //         this.rewarder = await this.SimpleRewarderPerBlock.deploy(this.partnerToken.address, this.lp.address, this.partnerRewardPerBlock, this.chef.address);
    //         await this.rewarder.deployed(); // t-58, b=15

    //         await this.partnerToken.mint(this.rewarder.address, "1000000000000000000000000"); // t-57, b=16

    //         await this.solar.transferOwnership(this.chef.address); // t-56, b=17

    //         await this.chef.add("100", this.lp.address, this.rewarder.address); // t-55, b=18
    //         await this.lp.connect(this.bob).approve(this.chef.address, "1000"); // t-54, b=19
    //         await advanceTimeAndBlock(108); // t+54, b=20

    //         expect(await this.solar.totalSupply()).to.equal("0");
    //         expect(await this.partnerToken.balanceOf(this.bob.address)).to.equal("0");
    //         await advanceTimeAndBlock(5); // t+59, b=21
    //         expect(await this.solar.totalSupply()).to.equal("0");
    //         expect(await this.partnerToken.balanceOf(this.bob.address)).to.equal("0");
    //         await advanceTimeAndBlock(5); // t+64, b=22
    //         await this.chef.connect(this.bob).deposit(0, "10"); // t+65, b=23
    //         expect(await this.solar.totalSupply()).to.equal("0");
    //         expect(await this.solar.balanceOf(this.bob.address)).to.equal("0");
    //         expect(await this.partnerToken.balanceOf(this.bob.address)).to.equal("0");
    //         expect(await this.solar.balanceOf(this.dev.address)).to.equal("0");
    //         expect(await this.lp.balanceOf(this.bob.address)).to.equal("990");
    //         await advanceTimeAndBlock(10); // t+75, b=24
    //         // Revert if Bob withdraws more than he deposited
    //         await expect(this.chef.connect(this.bob).withdraw(0, "11")).to.be.revertedWith("withdraw: not good"); // t+76, b=25
    //         await this.chef.connect(this.bob).withdraw(0, "10"); // t+77, b=26

    //         // At this point:
    //         //   Bob should have:
    //         //     - 12*50 = 600 (+50) SolarBeamToken
    //         //     - 3*40 = 120 PartnerToken
    //         //  Dev should have:
    //         //     - 12*20 = 240 (+20) SolarBeamToken
    //         //  Treasury should have:
    //         //     - 12*20 = 240 (+20) SolarBeamToken
    //         //  Investor should have:
    //         //     - 12*10 = 120 (+10) SolarBeamToken
    //         expect(await this.solar.totalSupply()).to.be.within(1200, 1300);
    //         expect(await this.solar.balanceOf(this.bob.address)).to.be.within(600, 650);
    //         expect(await this.solar.balanceOf(this.dev.address)).to.be.within(240, 260);
    //         expect(await this.solar.balanceOf(this.treasury.address)).to.be.within(240, 260);
    //         expect(await this.solar.balanceOf(this.investor.address)).to.be.within(120, 130);
    //         expect(await this.partnerToken.balanceOf(this.bob.address)).to.equal(120);
    //     });

    //     it("should distribute JOEs properly for each staker", async function () {
    //         const startTime = (await latest()).add(60);
    //         this.chef = await this.MCV2.deploy(this.solar.address, this.dev.address, this.treasury.address, this.investor.address, this.solarPerSec, startTime, this.devPercent, this.treasuryPercent, this.investorPercent);
    //         await this.chef.deployed(); // t-59, b=14

    //         this.rewarder = await this.SimpleRewarderPerBlock.deploy(this.partnerToken.address, this.lp.address, this.partnerRewardPerBlock, this.chef.address);
    //         await this.rewarder.deployed(); // t-58, b=15

    //         await this.partnerToken.mint(this.rewarder.address, "1000000000000000000000000"); // t-57, b=16

    //         await this.solar.transferOwnership(this.chef.address); // t-56, b=17

    //         await this.chef.add("100", this.lp.address, this.rewarder.address); // t-55, b=18
    //         await this.lp.connect(this.alice).approve(this.chef.address, "1000", {
    //             from: this.alice.address,
    //         }); // t-54, b=19
    //         await this.lp.connect(this.bob).approve(this.chef.address, "1000", {
    //             from: this.bob.address,
    //         }); // t-53, b=20
    //         await this.lp.connect(this.carol).approve(this.chef.address, "1000", {
    //             from: this.carol.address,
    //         }); // t-52, b=21

    //         // Alice deposits 10 LPs at t+10
    //         await advanceTimeAndBlock(61); // t+9, b=22
    //         await this.chef.connect(this.alice).deposit(0, "10", { from: this.alice.address }); // t+10, b=23
    //         // Bob deposits 20 LPs at t+14
    //         await advanceTimeAndBlock(3); // t+13, b=24
    //         await this.chef.connect(this.bob).deposit(0, "20"); // t+14, b=25
    //         // Carol deposits 30 LPs at block t+18
    //         await advanceTimeAndBlock(3); // t+17, b=26
    //         await this.chef.connect(this.carol).deposit(0, "30", { from: this.carol.address }); // t+18, b=27
    //         // Alice deposits 10 more LPs at t+20. At this point:
    //         //   Alice should have:
    //         //      - 4*50 + 4*50*1/3 + 2*50*1/6 = 283 (+50) SolarBeamToken
    //         //      - 2*40 + 2*40*1/3 + 2*40*1/6 = 120 PartnerToken
    //         //   Dev should have: 10*20 = 200 (+20)
    //         //   Treasury should have: 10*20 = 200 (+20)
    //         //   Investor should have: 10*10 = 100 (+10)
    //         //   MasterChef should have: 1000 - 283 - 200 - 200 - 100 = 217 (+100)
    //         await advanceTimeAndBlock(1); // t+19, b=28
    //         await this.chef.connect(this.alice).deposit(0, "10", { from: this.alice.address }); // t+20, b=29
    //         expect(await this.solar.totalSupply()).to.be.within(1000, 1100);
    //         // Because LP rewards are divided among participants and rounded down, we account
    //         // for rounding errors with an offset
    //         expect(await this.solar.balanceOf(this.alice.address)).to.be.within(283 - this.tokenOffset, 333 + this.tokenOffset);
    //         expect(await this.partnerToken.balanceOf(this.alice.address)).to.be.within(120 - this.tokenOffset, 120 + this.tokenOffset);

    //         expect(await this.solar.balanceOf(this.bob.address)).to.equal("0");
    //         expect(await this.partnerToken.balanceOf(this.bob.address)).to.equal("0");

    //         expect(await this.solar.balanceOf(this.carol.address)).to.equal("0");
    //         expect(await this.partnerToken.balanceOf(this.carol.address)).to.equal("0");

    //         expect(await this.solar.balanceOf(this.dev.address)).to.be.within(200 - this.tokenOffset, 220 + this.tokenOffset);
    //         expect(await this.solar.balanceOf(this.treasury.address)).to.be.within(200 - this.tokenOffset, 220 + this.tokenOffset);
    //         expect(await this.solar.balanceOf(this.investor.address)).to.be.within(100 - this.tokenOffset, 110 + this.tokenOffset);
    //         expect(await this.solar.balanceOf(this.chef.address)).to.be.within(217 - this.tokenOffset, 317 + this.tokenOffset);
    //         // Bob withdraws 5 LPs at t+30. At this point:
    //         //   Bob should have:
    //         //     - 4*50*2/3 + 2*50*2/6 + 10*50*2/7 = 309 (+50) SolarBeamToken
    //         //     - 2*40*2/3 + 2*40*2/6 + 2*40*2/7 = 102 PartnerToken
    //         //   Dev should have: 20*20= 400 (+20)
    //         //   Treasury should have: 20*20 = 400 (+20)
    //         //   Investor should have: 20*10 = 200 (+10)
    //         //   MasterChef should have: 217 + 1000 - 309 - 200 - 200 - 100 = 408 (+100)
    //         await advanceTimeAndBlock(9); // t+29, b=32
    //         await this.chef.connect(this.bob).withdraw(0, "5", { from: this.bob.address }); // t+30, b=33
    //         expect(await this.solar.totalSupply()).to.be.within(2000, 2100);
    //         // Because of rounding errors, we use token offsets
    //         expect(await this.solar.balanceOf(this.alice.address)).to.be.within(283 - this.tokenOffset, 333 + this.tokenOffset);
    //         expect(await this.partnerToken.balanceOf(this.alice.address)).to.be.within(119 - this.tokenOffset, 119 + this.tokenOffset);

    //         expect(await this.solar.balanceOf(this.bob.address)).to.be.within(309 - this.tokenOffset, 359 + this.tokenOffset);
    //         expect(await this.partnerToken.balanceOf(this.bob.address)).to.be.within(101 - this.tokenOffset, 101 + this.tokenOffset);

    //         expect(await this.solar.balanceOf(this.carol.address)).to.equal("0");
    //         expect(await this.partnerToken.balanceOf(this.carol.address)).to.equal("0");

    //         expect(await this.solar.balanceOf(this.dev.address)).to.be.within(400 - this.tokenOffset, 420 + this.tokenOffset);
    //         expect(await this.solar.balanceOf(this.treasury.address)).to.be.within(400 - this.tokenOffset, 420 + this.tokenOffset);
    //         expect(await this.solar.balanceOf(this.investor.address)).to.be.within(200 - this.tokenOffset, 210 + this.tokenOffset);
    //         expect(await this.solar.balanceOf(this.chef.address)).to.be.within(408 - this.tokenOffset, 508 + this.tokenOffset);
    //         // Alice withdraws 20 LPs at t+40
    //         // Bob withdraws 15 LPs at t+50
    //         // Carol withdraws 30 LPs at t+60
    //         await advanceTimeAndBlock(9); // t+39, b=34
    //         await this.chef.connect(this.alice).withdraw(0, "20", { from: this.alice.address }); // t+40, b=35
    //         await advanceTimeAndBlock(9); // t+49, b=36
    //         await this.chef.connect(this.bob).withdraw(0, "15", { from: this.bob.address }); // t+50, b=37
    //         await advanceTimeAndBlock(9); // t+59, b=38
    //         await this.chef.connect(this.carol).withdraw(0, "30", { from: this.carol.address }); // t+60, b=39
    //         expect(await this.solar.totalSupply()).to.be.within(5000, 5100);
    //         // Alice should have:
    //         //  - 283 + 10*50*2/7 + 10*50*20/65 = 579 (+50) SolarBeamToken
    //         //  - 120 + 2*40*2/7 + 2*40*20/65 = 167 PartnerToken
    //         expect(await this.solar.balanceOf(this.alice.address)).to.be.within(579 - this.tokenOffset, 629 + this.tokenOffset);
    //         expect(await this.partnerToken.balanceOf(this.alice.address)).to.be.within(167 - this.tokenOffset, 167 + this.tokenOffset);
    //         // Bob should have:
    //         //  - 309 + 10*50*15/65 + 10*50*15/45 = 591 (+50) SolarBeamToken
    //         //  - 102 + 2*40*15/65 + 2*40*15/45 = 147 PartnerToken
    //         expect(await this.solar.balanceOf(this.bob.address)).to.be.within(591 - this.tokenOffset, 641 + this.tokenOffset);
    //         expect(await this.partnerToken.balanceOf(this.bob.address)).to.be.within(147 - this.tokenOffset, 147 + this.tokenOffset);
    //         // Carol should have:
    //         //  - 2*50*3/6 + 10*50*3/7 + 10*50*30/65 + 10*50*30/45 + 10*50 = 1445 (+50) SolarBeamToken
    //         //  - 2*40*1/2 + 2*40*3/7 + 2*40*30/65 + 2*40*30/45 + 2*40 = 244 PartnerToken
    //         expect(await this.solar.balanceOf(this.carol.address)).to.be.within(1328 - this.tokenOffset, 1378 + this.tokenOffset);
    //         expect(await this.partnerToken.balanceOf(this.carol.address)).to.be.within(244 - this.tokenOffset, 244 + this.tokenOffset);
    //         // Dev should have: 50*20 = 1000 (+20)
    //         // Treasury should have: 50*20 = 1000 (+20)
    //         // Investor should have: 50*10 = 500 (+10)
    //         expect(await this.solar.balanceOf(this.dev.address)).to.be.within(1000 - this.tokenOffset, 1020 + this.tokenOffset);
    //         expect(await this.solar.balanceOf(this.treasury.address)).to.be.within(1000 - this.tokenOffset, 1020 + this.tokenOffset);
    //         expect(await this.solar.balanceOf(this.investor.address)).to.be.within(500 - this.tokenOffset, 510 + this.tokenOffset);
    //         // MasterChefJoe should have nothing
    //         expect(await this.solar.balanceOf(this.chef.address)).to.be.within(0, 0 + this.tokenOffset);

    //         // // All of them should have 1000 LPs back.
    //         expect(await this.lp.balanceOf(this.alice.address)).to.equal("1000");
    //         expect(await this.lp.balanceOf(this.bob.address)).to.equal("1000");
    //         expect(await this.lp.balanceOf(this.carol.address)).to.equal("1000");
    //     });

    //     it("should give proper JOEs after updating emission rate", async function () {
    //         const startTime = (await latest()).add(60);
    //         this.chef = await this.MCV2.deploy(this.solar.address, this.dev.address, this.treasury.address, this.investor.address, this.solarPerSec, startTime, this.devPercent, this.treasuryPercent, this.investorPercent);
    //         await this.chef.deployed(); // t-59, b=14

    //         this.rewarder = await this.SimpleRewarderPerBlock.deploy(this.partnerToken.address, this.lp.address, this.partnerRewardPerBlock, this.chef.address);
    //         await this.rewarder.deployed(); // t-58, b=15

    //         await this.partnerToken.mint(this.rewarder.address, "1000000000000000000000000"); // t-57, b=16

    //         await this.solar.transferOwnership(this.chef.address); // t-56, b=17

    //         await this.lp.connect(this.alice).approve(this.chef.address, "1000", { from: this.alice.address }); // t-55, b=18
    //         await this.chef.add("10", this.lp.address, this.rewarder.address); // t-54, b=19
    //         // Alice deposits 10 LPs at t+10
    //         await advanceTimeAndBlock(63); // t+9, b=20
    //         await this.chef.connect(this.alice).deposit(0, "10", { from: this.alice.address }); // t+10, b=21
    //         // At t+110, Alice should have:
    //         //   - 100*50 = 5000 (+50) SolarBeamToken
    //         //   - 1*40 = 40 PartnerToken
    //         await advanceTimeAndBlock(100); // t+110, b=22
    //         expect((await this.chef.pendingTokens(0, this.alice.address)).pendingJoe).to.be.within(5000, 5050);
    //         expect(await this.rewarder.pendingTokens(this.alice.address)).to.equal(40);
    //         // Lower JOE emission rate to 40 JOE per sec
    //         await this.chef.updateEmissionRate(40); // t+111, b=23
    //         // At t+115, Alice should have:
    //         //   - 5000 + 1*100*0.5 + 4*40*0.5 = 5130 (+50) SolarBeamToken
    //         //   - 40 + 2*40 = 120 PartnerToken
    //         await advanceTimeAndBlock(4); // t+115, b=24
    //         expect((await this.chef.pendingTokens(0, this.alice.address)).pendingJoe).to.be.within(5130, 5180);
    //         expect(await this.rewarder.pendingTokens(this.alice.address)).to.equal(120);
    //         // Increase PartnerToken emission rate to 90 PartnerToken per block
    //         await this.rewarder.setRewardRate(90); // t+116, b=25
    //         // At b=35, Alice should have:
    //         //   - 5130 + 1*40*0.5 + 20*40*0.5 = 5550 (+50) SolarBeamToken
    //         //   - 120 + 1*40 + 5*90 = 610 PartnerToken
    //         await advanceTimeAndBlock(2); // t+118, b=26
    //         await advanceTimeAndBlock(3); // t+121, b=27
    //         await advanceTimeAndBlock(4); // t+125, b=28
    //         await advanceTimeAndBlock(5); // t+130, b=29
    //         await advanceTimeAndBlock(6); // t+136, b=30
    //         expect((await this.chef.pendingTokens(0, this.alice.address)).pendingJoe).to.be.within(5550, 5600);
    //         expect(await this.rewarder.pendingTokens(this.alice.address)).to.equal(610);
    //     });
    // });

    // context("With ERC/LP token added to the field and using SimpleRewarderPerSec", function () {
    //     beforeEach(async function () {
    //         this.lp = await this.ERC20Mock.deploy("LPToken", "LP", "10000000000");
    //         await this.lp.transfer(this.alice.address, "1000");
    //         await this.lp.transfer(this.bob.address, "1000");
    //         await this.lp.transfer(this.carol.address, "1000");

    //         this.lp2 = await this.ERC20Mock.deploy("LPToken2", "LP2", "10000000000");
    //         await this.lp2.transfer(this.alice.address, "1000");
    //         await this.lp2.transfer(this.bob.address, "1000");
    //         await this.lp2.transfer(this.carol.address, "1000");

    //         this.dummyToken = await this.ERC20Mock.deploy("DummyToken", "DUMMY", "1");
    //         await this.dummyToken.transfer(this.partnerDev.address, "1");
    //     });

    //     it("should check rewarder's arguments are contracts", async function () {
    //         await expect(this.SimpleRewarderPerSec.deploy(ADDRESS_ZERO, this.lp.address, this.partnerRewardPerSec, this.chef.address, false)).to.be.revertedWith("constructor: reward token must be a valid contract");

    //         await expect(this.SimpleRewarderPerSec.deploy(this.partnerToken.address, ADDRESS_ZERO, this.partnerRewardPerSec, this.chef.address, false)).to.be.revertedWith("constructor: LP token must be a valid contract");

    //         await expect(this.SimpleRewarderPerSec.deploy(this.partnerToken.address, this.lp.address, this.partnerRewardPerSec, ADDRESS_ZERO, false)).to.be.revertedWith("constructor: MasterChefJoe must be a valid contract");
    //     });

    //     it("should check rewarder added and set properly", async function () {
    //         const startTime = (await latest()).add(60);
    //         this.chef = await this.MCV2.deploy(this.solar.address, this.dev.address, this.treasury.address, this.investor.address, this.solarPerSec, startTime, this.devPercent, this.treasuryPercent, this.investorPercent);
    //         await this.chef.deployed();

    //         this.rewarder = await this.SimpleRewarderPerSec.deploy(this.partnerToken.address, this.lp.address, this.partnerRewardPerSec, this.chef.address, false);
    //         await this.rewarder.deployed();

    //         // Try to add rewarder that is neither zero address or contract address
    //         await expect(this.chef.add("100", this.lp.address, this.dev.address)).to.be.revertedWith("add: rewarder must be contract or zero");

    //         await this.chef.add("100", this.lp.address, this.rewarder.address);

    //         // Try to set rewarder that is neither zero address or contract address
    //         await expect(this.chef.set("0", "200", this.dev.address, true)).to.be.revertedWith("set: rewarder must be contract or zero");

    //         await this.chef.set("0", "200", this.rewarder.address, false);
    //         expect((await this.chef.poolInfo(0)).allocPoint).to.equal("200");
    //     });

    //     it("should allow a given pool's allocation weight and rewarder to be updated", async function () {
    //         const startTime = (await latest()).add(60);
    //         this.chef = await this.MCV2.deploy(this.solar.address, this.dev.address, this.treasury.address, this.investor.address, this.solarPerSec, startTime, this.devPercent, this.treasuryPercent, this.investorPercent);
    //         await this.chef.deployed();

    //         this.rewarder = await this.SimpleRewarderPerSec.deploy(this.partnerToken.address, this.lp.address, this.partnerRewardPerSec, this.chef.address, false);
    //         await this.rewarder.deployed();

    //         await this.chef.add("100", this.lp.address, ADDRESS_ZERO);
    //         expect((await this.chef.poolInfo(0)).allocPoint).to.equal("100");
    //         expect((await this.chef.poolInfo(0)).rewarder).to.equal(ADDRESS_ZERO);

    //         await this.chef.set("0", "150", this.rewarder.address, true);
    //         expect((await this.chef.poolInfo(0)).allocPoint).to.equal("150");
    //         expect((await this.chef.poolInfo(0)).rewarder).to.equal(this.rewarder.address);
    //     });

    //     it("should allow emergency withdraw from rewarder contract", async function () {
    //         // ERC-20
    //         this.rewarder = await this.SimpleRewarderPerSec.deploy(this.partnerToken.address, this.lp.address, this.partnerRewardPerSec, this.chef.address, false);
    //         await this.rewarder.deployed();

    //         await this.partnerToken.mint(this.rewarder.address, "1000000");
    //         await this.rewarder.emergencyWithdraw();
    //         expect(await this.partnerToken.balanceOf(this.alice.address)).to.equal("1000000");

    //         // AVAX
    //         this.rewarderAVAX = await this.SimpleRewarderPerSec.deploy(
    //             this.partnerToken.address, // Use any token address
    //             this.lp.address,
    //             this.partnerRewardPerSec,
    //             this.chef.address,
    //             true
    //         );
    //         await this.rewarderAVAX.deployed();

    //         const rewardAmount = ethers.utils.parseEther("10");
    //         const tx = { to: this.rewarderAVAX.address, value: rewardAmount };
    //         await this.bob.sendTransaction(tx);
    //         const bal = await ethers.provider.getBalance(this.rewarderAVAX.address);
    //         expect(bal).to.equal(rewardAmount);
    //         const aliceBalBefore = await this.alice.getBalance();
    //         await this.rewarderAVAX.emergencyWithdraw();
    //         const aliceBalAfter = await this.alice.getBalance();
    //         expect(aliceBalAfter.sub(aliceBalBefore)).to.lt(rewardAmount);
    //     });

    //     it("should reward partner token accurately after rewarder runs out of tokens and is topped up again", async function () {
    //         const startTime = (await latest()).add(60);
    //         this.chef = await this.MCV2.deploy(this.solar.address, this.dev.address, this.treasury.address, this.investor.address, this.solarPerSec, startTime, this.devPercent, this.treasuryPercent, this.investorPercent);
    //         await this.chef.deployed(); // t-59

    //         this.rewarder = await this.SimpleRewarderPerSec.deploy(this.partnerToken.address, this.lp.address, this.partnerRewardPerSec, this.chef.address, false);
    //         await this.rewarder.deployed(); // t-58

    //         await this.partnerToken.mint(this.rewarder.address, "80"); // t-57

    //         await this.solar.transferOwnership(this.chef.address); // t-56

    //         await this.chef.add("100", this.lp.address, this.rewarder.address); // t-55

    //         await this.lp.connect(this.bob).approve(this.chef.address, "1000"); // t-54
    //         await this.chef.connect(this.bob).deposit(0, "100"); // t-53
    //         await advanceTimeAndBlock(4); // t-49

    //         await this.chef.connect(this.bob).deposit(0, "0"); // t-48
    //         // Bob should have:
    //         //   - 0 SolarBeamToken
    //         //   - 80 PartnerToken
    //         expect(await this.partnerToken.balanceOf(this.bob.address)).to.equal(80);
    //         await advanceTimeAndBlock(5); // t-43

    //         await this.partnerToken.mint(this.rewarder.address, "1000"); // t-42
    //         await advanceTimeAndBlock(10); // t-32

    //         await this.chef.connect(this.bob).deposit(0, "0"); // t-31

    //         // Bob should have:
    //         //   - 0 SolarBeamToken
    //         //   - 80 + 20*40 = 880 (+40) PartnerToken
    //         expect(await this.partnerToken.balanceOf(this.bob.address)).to.be.within(760, 920);
    //     });

    //     it("should reward AVAX accurately after rewarder runs out of AVAX and is topped up again", async function () {
    //         const bobBalBefore = await this.bob.getBalance();
    //         const startTime = (await latest()).add(60);
    //         this.chef = await this.MCV2.deploy(this.solar.address, this.dev.address, this.treasury.address, this.investor.address, this.solarPerSec, startTime, this.devPercent, this.treasuryPercent, this.investorPercent);
    //         await this.chef.deployed(); // t-59

    //         this.rewarderAVAX = await this.SimpleRewarderPerSec.deploy(
    //             this.partnerToken.address, // Use any token
    //             this.lp.address,
    //             ethers.utils.parseEther("10"),
    //             this.chef.address,
    //             true
    //         );
    //         await this.rewarderAVAX.deployed(); // t-58

    //         await this.alice.sendTransaction({ to: this.rewarderAVAX.address, value: ethers.utils.parseEther("20") }); // t-57

    //         await this.solar.transferOwnership(this.chef.address); // t-56

    //         await this.chef.add("100", this.lp.address, this.rewarderAVAX.address); // t-55

    //         await this.lp.connect(this.bob).approve(this.chef.address, "1000"); // t-54
    //         await this.chef.connect(this.bob).deposit(0, "100"); // t-53
    //         await advanceTimeAndBlock(4); // t-49

    //         await this.chef.connect(this.bob).deposit(0, "0"); // t-48
    //         // Bob should have:
    //         //   - 0 SolarBeamToken
    //         //   - 20 Ether
    //         const bobBalAfter = await this.bob.getBalance();
    //         expect(bobBalAfter.sub(bobBalBefore)).to.gt(ethers.utils.parseEther("19"));
    //         expect(bobBalAfter.sub(bobBalBefore)).to.lt(ethers.utils.parseEther("20"));
    //         await advanceTimeAndBlock(5); // t-43

    //         await this.alice.sendTransaction({ to: this.rewarderAVAX.address, value: ethers.utils.parseEther("1000") }); // t-42
    //         await advanceTimeAndBlock(10); // t-32

    //         await this.chef.connect(this.bob).deposit(0, "0"); // t-31

    //         // Bob should have:
    //         //   - 0 SolarBeamToken
    //         //   - 20 + 20*10 = 220 (+10) PartnerToken
    //         const bobBalFinal = await this.bob.getBalance();
    //         const b = bobBalFinal.sub(bobBalAfter);
    //         console.log(b.toString());
    //         expect(bobBalFinal.sub(bobBalAfter)).to.gt(ethers.utils.parseEther("190"));
    //         expect(bobBalFinal.sub(bobBalAfter)).to.lt(ethers.utils.parseEther("210"));
    //     });

    //     it("should only allow MasterChefJoeV2 to call onJoeReward", async function () {
    //         const startTime = (await latest()).add(60);
    //         this.chef = await this.MCV2.deploy(this.solar.address, this.dev.address, this.treasury.address, this.investor.address, this.solarPerSec, startTime, this.devPercent, this.treasuryPercent, this.investorPercent);
    //         await this.chef.deployed(); // t-59

    //         this.rewarder = await this.SimpleRewarderPerSec.deploy(this.partnerToken.address, this.lp.address, this.partnerRewardPerSec, this.chef.address, false);
    //         await this.rewarder.deployed(); // t-58

    //         await this.partnerToken.mint(this.rewarder.address, "1000000000000000000000000"); // t-57

    //         await this.solar.transferOwnership(this.chef.address); // t-56

    //         await this.chef.add("100", this.lp.address, this.rewarder.address); // t-55

    //         await this.lp.connect(this.bob).approve(this.chef.address, "1000"); // t-54
    //         await this.chef.connect(this.bob).deposit(0, "100"); // t-53
    //         await advanceTimeAndBlock(42); // t-11

    //         await expect(this.rewarder.onJoeReward(this.bob.address, "100")).to.be.revertedWith("onlyMCJ: only MasterChefJoe can call this function"); // t-10
    //         await this.chef.connect(this.bob).deposit(0, "0"); // t-9
    //         // Bob should have:
    //         //   - 0 SolarBeamToken
    //         //   - 44*40 = 1760 (+40) PartnerToken
    //         expect(await this.solar.balanceOf(this.bob.address)).to.equal("0");
    //         expect(await this.partnerToken.balanceOf(this.bob.address)).to.be.within(1760, 1800);
    //     });

    //     it("should allow rewarder to be set and removed mid farming", async function () {
    //         const startTime = (await latest()).add(60);
    //         this.chef = await this.MCV2.deploy(this.solar.address, this.dev.address, this.treasury.address, this.investor.address, this.solarPerSec, startTime, this.devPercent, this.treasuryPercent, this.investorPercent);
    //         await this.chef.deployed(); // t-59

    //         this.rewarder = await this.SimpleRewarderPerSec.deploy(this.partnerToken.address, this.lp.address, this.partnerRewardPerSec, this.chef.address, false);
    //         await this.rewarder.deployed(); // t-58

    //         await this.partnerToken.mint(this.rewarder.address, "1000000000000000000000000"); // t-57

    //         await this.solar.transferOwnership(this.chef.address); // t-56

    //         await this.chef.add("100", this.lp.address, ADDRESS_ZERO); // t-55

    //         await this.lp.connect(this.bob).approve(this.chef.address, "1000"); // t-54
    //         await this.chef.connect(this.bob).deposit(0, "100"); // t-53
    //         await advanceTimeAndBlock(42); // t-11

    //         await this.chef.connect(this.bob).deposit(0, "0"); // t-10
    //         expect(await this.solar.balanceOf(this.bob.address)).to.equal("0");
    //         // At t+10, Bob should have pending:
    //         //   - 10*50 = 500 (+50) SolarBeamToken
    //         //   - 0 PartnerToken
    //         await advanceTimeAndBlock(20); // t+10
    //         expect((await this.chef.pendingTokens(0, this.bob.address)).pendingJoe).to.be.within(500, 550);
    //         expect((await this.chef.pendingTokens(0, this.bob.address)).bonusTokenAddress).to.equal(ADDRESS_ZERO);
    //         expect((await this.chef.pendingTokens(0, this.bob.address)).pendingBonusToken).to.equal(0);

    //         // Pass rewarder but don't overwrite
    //         await this.chef.set(0, 100, this.rewarder.address, false); // t+11

    //         // At t+20, Bob should have pending:
    //         //   - 500 + 10*50 = 1000 (+50) SolarBeamToken
    //         //   - 0 PartnerToken
    //         await advanceTimeAndBlock(9); // t+20
    //         expect((await this.chef.pendingTokens(0, this.bob.address)).pendingJoe).to.be.within(1000, 1050);
    //         expect((await this.chef.pendingTokens(0, this.bob.address)).bonusTokenAddress).to.equal(ADDRESS_ZERO);
    //         expect((await this.chef.pendingTokens(0, this.bob.address)).pendingBonusToken).to.equal(0);

    //         // Pass rewarder and overwrite
    //         await this.chef.set(0, 100, this.rewarder.address, true); // t+21

    //         // At t+30, Bob should have pending:
    //         //   - 1000 + 10*50 = 1500 (+50) SolarBeamToken
    //         //   - 0 PartnerToken - this is because rewarder hasn't registered the user yet! User needs to call deposit again
    //         await advanceTimeAndBlock(9); // t+30
    //         expect((await this.chef.pendingTokens(0, this.bob.address)).pendingJoe).to.be.within(1500, 1550);
    //         expect((await this.chef.pendingTokens(0, this.bob.address)).bonusTokenAddress).to.equal(this.partnerToken.address);
    //         expect((await this.chef.pendingTokens(0, this.bob.address)).bonusTokenSymbol).to.equal("SUSHI");
    //         expect((await this.chef.pendingTokens(0, this.bob.address)).pendingBonusToken).to.equal(0);

    //         // Call deposit to start receiving PartnerTokens
    //         await this.chef.connect(this.bob).deposit(0, 0); // t+31

    //         // At t+40, Bob should have pending:
    //         //   - 9*50 = 450 (+50) SolarBeamToken
    //         //   - 9*40 = 360 (+40) PartnerToken
    //         await advanceTimeAndBlock(9); // t+40
    //         expect((await this.chef.pendingTokens(0, this.bob.address)).pendingJoe).to.be.within(450, 500);
    //         expect((await this.chef.pendingTokens(0, this.bob.address)).bonusTokenAddress).to.equal(this.partnerToken.address);
    //         expect((await this.chef.pendingTokens(0, this.bob.address)).bonusTokenSymbol).to.equal("SUSHI");
    //         expect((await this.chef.pendingTokens(0, this.bob.address)).pendingBonusToken).to.be.within(360, 400);

    //         // Set reward rate to zero
    //         await this.rewarder.setRewardRate(0); // t+41

    //         // At t+50, Bob should have pending:
    //         //   - 450 + 10*50 = 950 (+50) SolarBeamToken
    //         //   - 360 + 1*40 = 400 (+40) PartnerToken
    //         await advanceTimeAndBlock(4); // t+45
    //         await advanceTimeAndBlock(5); // t+50
    //         expect((await this.chef.pendingTokens(0, this.bob.address)).pendingJoe).to.be.within(950, 1000);
    //         expect((await this.chef.pendingTokens(0, this.bob.address)).bonusTokenAddress).to.equal(this.partnerToken.address);
    //         expect((await this.chef.pendingTokens(0, this.bob.address)).bonusTokenSymbol).to.equal("SUSHI");
    //         expect((await this.chef.pendingTokens(0, this.bob.address)).pendingBonusToken).to.be.within(400, 440);

    //         // Claim reward
    //         await this.chef.connect(this.bob).deposit(0, 0); // t+51

    //         // Bob should have:
    //         //   - 1500 + 1*50 + 950 + 1*50 = 2550 (+50) SolarBeamToken
    //         //   - 400 (+40) PartnerToken
    //         expect(await this.solar.balanceOf(this.bob.address)).to.be.within(2550, 2600);
    //         expect(await this.partnerToken.balanceOf(this.bob.address)).to.be.within(400, 440);
    //     });

    //     it("should give out JOEs only after farming time", async function () {
    //         const startTime = (await latest()).add(60);
    //         this.chef = await this.MCV2.deploy(this.solar.address, this.dev.address, this.treasury.address, this.investor.address, this.solarPerSec, startTime, this.devPercent, this.treasuryPercent, this.investorPercent);
    //         await this.chef.deployed(); // t-59

    //         this.rewarder = await this.SimpleRewarderPerSec.deploy(this.partnerToken.address, this.lp.address, this.partnerRewardPerSec, this.chef.address, false);
    //         await this.rewarder.deployed(); // t-58

    //         await this.partnerToken.mint(this.rewarder.address, "1000000000000000000000000"); // t-57

    //         await this.solar.transferOwnership(this.chef.address); // t-56

    //         await this.chef.add("100", this.lp.address, this.rewarder.address); // t-55

    //         await this.lp.connect(this.bob).approve(this.chef.address, "1000"); // t-54
    //         await this.chef.connect(this.bob).deposit(0, "100"); // t-53
    //         await advanceTimeAndBlock(42); // t-11

    //         await this.chef.connect(this.bob).deposit(0, "0"); // t-10
    //         // Bob should have:
    //         //   - 0 SolarBeamToken
    //         //   - 43*40 = 1720 (+40) PartnerToken
    //         expect(await this.solar.balanceOf(this.bob.address)).to.equal("0");
    //         expect(await this.partnerToken.balanceOf(this.bob.address)).to.be.within(1720, 1760);
    //         await advanceTimeAndBlock(8); // t-2

    //         await this.chef.connect(this.bob).deposit(0, "0"); // t-1
    //         expect(await this.solar.balanceOf(this.bob.address)).to.equal("0");
    //         await advanceTimeAndBlock(10); // t+9

    //         await this.chef.connect(this.bob).deposit(0, "0"); // t+10
    //         // Bob should have:
    //         //   - 10*50 = 500 (+50) SolarBeamToken
    //         //   - 1720 + 20*40 = 2520 (+40) PartnerToken
    //         expect(await this.solar.balanceOf(this.bob.address)).to.be.within(500, 550);
    //         expect(await this.partnerToken.balanceOf(this.bob.address)).to.be.within(2520, 2560);

    //         await advanceTimeAndBlock(4); // t+14
    //         await this.chef.connect(this.bob).deposit(0, "0"); // t+15

    //         // At this point:
    //         //   Bob should have:
    //         //     - 500 + 5*50 = 750 (+50) SolarBeamToken
    //         //     - 2520 + 5*40 = 2720 (+40) PartnerToken
    //         //   Dev should have: 15*20 = 300 (+20)
    //         //   Treasury should have: 15*20 = 300 (+20)
    //         //   Investor should have: 15*10 = 150 (+10)
    //         expect(await this.solar.balanceOf(this.bob.address)).to.be.within(750, 800);
    //         expect(await this.partnerToken.balanceOf(this.bob.address)).to.be.within(2720, 2760);
    //         expect(await this.solar.balanceOf(this.dev.address)).to.be.within(300, 320);
    //         expect(await this.solar.balanceOf(this.treasury.address)).to.be.within(300, 320);
    //         expect(await this.solar.balanceOf(this.investor.address)).to.be.within(150, 160);
    //         expect(await this.solar.totalSupply()).to.be.within(1500, 1600);
    //     });

    //     it("should not distribute JOEs if no one deposit", async function () {
    //         const startTime = (await latest()).add(60);
    //         this.chef = await this.MCV2.deploy(this.solar.address, this.dev.address, this.treasury.address, this.investor.address, this.solarPerSec, startTime, this.devPercent, this.treasuryPercent, this.investorPercent);
    //         await this.chef.deployed(); // t-59

    //         this.rewarder = await this.SimpleRewarderPerSec.deploy(this.partnerToken.address, this.lp.address, this.partnerRewardPerSec, this.chef.address, false);
    //         await this.rewarder.deployed(); // t-58

    //         await this.partnerToken.mint(this.rewarder.address, "1000000000000000000000000"); // t-57

    //         await this.solar.transferOwnership(this.chef.address); // t-56

    //         await this.chef.add("100", this.lp.address, this.rewarder.address); // t-55
    //         await this.lp.connect(this.bob).approve(this.chef.address, "1000"); // t-54
    //         await advanceTimeAndBlock(108); // t+54

    //         expect(await this.solar.totalSupply()).to.equal("0");
    //         expect(await this.partnerToken.balanceOf(this.bob.address)).to.equal("0");
    //         await advanceTimeAndBlock(5); // t+59
    //         expect(await this.solar.totalSupply()).to.equal("0");
    //         expect(await this.partnerToken.balanceOf(this.bob.address)).to.equal("0");
    //         await advanceTimeAndBlock(5); // t+64
    //         await this.chef.connect(this.bob).deposit(0, "10"); // t+65
    //         expect(await this.solar.totalSupply()).to.equal("0");
    //         expect(await this.solar.balanceOf(this.bob.address)).to.equal("0");
    //         expect(await this.partnerToken.balanceOf(this.bob.address)).to.equal("0");
    //         expect(await this.solar.balanceOf(this.dev.address)).to.equal("0");
    //         expect(await this.lp.balanceOf(this.bob.address)).to.equal("990");
    //         await advanceTimeAndBlock(10); // t+75
    //         // Revert if Bob withdraws more than he deposited
    //         await expect(this.chef.connect(this.bob).withdraw(0, "11")).to.be.revertedWith("withdraw: not good"); // t+76
    //         await this.chef.connect(this.bob).withdraw(0, "10"); // t+77

    //         // At this point:
    //         //   Bob should have:
    //         //     - 12*50 = 600 (+50) SolarBeamToken
    //         //     - 12*40 = 480 (+40) PartnerToken
    //         //  Dev should have:
    //         //     - 12*20 = 240 (+20) SolarBeamToken
    //         //  Treasury should have:
    //         //     - 12*20 = 240 (+20) SolarBeamToken
    //         //  Investor should have:
    //         //     - 12*10 = 120 (+10) SolarBeamToken
    //         expect(await this.solar.totalSupply()).to.be.within(1200, 1300);
    //         expect(await this.solar.balanceOf(this.bob.address)).to.be.within(600, 650);
    //         expect(await this.solar.balanceOf(this.dev.address)).to.be.within(240, 260);
    //         expect(await this.solar.balanceOf(this.treasury.address)).to.be.within(240, 260);
    //         expect(await this.solar.balanceOf(this.investor.address)).to.be.within(120, 130);
    //         expect(await this.partnerToken.balanceOf(this.bob.address)).to.be.within(480, 520);
    //     });

    //     it("should distribute JOEs properly for each staker", async function () {
    //         const startTime = (await latest()).add(60);
    //         this.chef = await this.MCV2.deploy(this.solar.address, this.dev.address, this.treasury.address, this.investor.address, this.solarPerSec, startTime, this.devPercent, this.treasuryPercent, this.investorPercent);
    //         await this.chef.deployed(); // t-59

    //         this.rewarder = await this.SimpleRewarderPerSec.deploy(this.partnerToken.address, this.lp.address, this.partnerRewardPerSec, this.chef.address, false);
    //         await this.rewarder.deployed(); // t-58

    //         await this.partnerToken.mint(this.rewarder.address, "1000000000000000000000000"); // t-57

    //         await this.solar.transferOwnership(this.chef.address); // t-56

    //         await this.chef.add("100", this.lp.address, this.rewarder.address); // t-55
    //         await this.lp.connect(this.alice).approve(this.chef.address, "1000", {
    //             from: this.alice.address,
    //         }); // t-54
    //         await this.lp.connect(this.bob).approve(this.chef.address, "1000", {
    //             from: this.bob.address,
    //         }); // t-53
    //         await this.lp.connect(this.carol).approve(this.chef.address, "1000", {
    //             from: this.carol.address,
    //         }); // t-52

    //         // Alice deposits 10 LPs at t+10
    //         await advanceTimeAndBlock(59); // t+9
    //         await this.chef.connect(this.alice).deposit(0, "10", { from: this.alice.address }); // t+10
    //         // Bob deposits 20 LPs at t+14
    //         await advanceTimeAndBlock(3); // t+13
    //         await this.chef.connect(this.bob).deposit(0, "20"); // t+14
    //         // Carol deposits 30 LPs at block t+18
    //         await advanceTimeAndBlock(3); // t+17
    //         await this.chef.connect(this.carol).deposit(0, "30", { from: this.carol.address }); // t+18
    //         // Alice deposits 10 more LPs at t+20. At this point:
    //         //   Alice should have:
    //         //      - 4*50 + 4*50*1/3 + 2*50*1/6 = 283 (+50) SolarBeamToken
    //         //      - 4*40 + 4*40*1/3 + 2*40*1/6 = 226 (+40) PartnerToken
    //         //   Dev should have: 10*20 = 200 (+20)
    //         //   Treasury should have: 10*20 = 200 (+20)
    //         //   Investor should have: 10*10 = 100 (+10)
    //         //   MasterChef should have: 1000 - 283 - 200 - 200 - 100 = 217 (+100)
    //         await advanceTimeAndBlock(1); // t+19
    //         await this.chef.connect(this.alice).deposit(0, "10", { from: this.alice.address }); // t+20,
    //         expect(await this.solar.totalSupply()).to.be.within(1000, 1100);
    //         // Because LP rewards are divided among participants and rounded down, we account
    //         // for rounding errors with an offset
    //         expect(await this.solar.balanceOf(this.alice.address)).to.be.within(283 - this.tokenOffset, 333 + this.tokenOffset);
    //         expect(await this.partnerToken.balanceOf(this.alice.address)).to.be.within(226 - this.tokenOffset, 266 + this.tokenOffset);

    //         expect(await this.solar.balanceOf(this.bob.address)).to.equal("0");
    //         expect(await this.partnerToken.balanceOf(this.bob.address)).to.equal("0");

    //         expect(await this.solar.balanceOf(this.carol.address)).to.equal("0");
    //         expect(await this.partnerToken.balanceOf(this.carol.address)).to.equal("0");

    //         expect(await this.solar.balanceOf(this.dev.address)).to.be.within(200 - this.tokenOffset, 220 + this.tokenOffset);
    //         expect(await this.solar.balanceOf(this.treasury.address)).to.be.within(200 - this.tokenOffset, 220 + this.tokenOffset);
    //         expect(await this.solar.balanceOf(this.investor.address)).to.be.within(100 - this.tokenOffset, 110 + this.tokenOffset);
    //         expect(await this.solar.balanceOf(this.chef.address)).to.be.within(217 - this.tokenOffset, 317 + this.tokenOffset);
    //         // Bob withdraws 5 LPs at t+30. At this point:
    //         //   Bob should have:
    //         //     - 4*50*2/3 + 2*50*2/6 + 10*50*2/7 = 309 (+50) SolarBeamToken
    //         //     - 4*40*2/3 + 2*40*2/6 + 10*40*2/7 = 247 (+40) PartnerToken
    //         //   Dev should have: 20*20 = 400 (+20)
    //         //   Treasury should have: 20*20 = 400 (+20)
    //         //   Investor should have: 20*10 = 200 (+10)
    //         //   MasterChef should have: 217 + 1000 - 309 - 200 - 200 - 100 = 408 (+100)
    //         await advanceTimeAndBlock(9); // t+29
    //         await this.chef.connect(this.bob).withdraw(0, "5", { from: this.bob.address }); // t+30
    //         expect(await this.solar.totalSupply()).to.be.within(2000, 2100);
    //         // Because of rounding errors, we use token offsets
    //         expect(await this.solar.balanceOf(this.alice.address)).to.be.within(283 - this.tokenOffset, 333 + this.tokenOffset);
    //         expect(await this.partnerToken.balanceOf(this.alice.address)).to.be.within(226 - this.tokenOffset, 266 + this.tokenOffset);

    //         expect(await this.solar.balanceOf(this.bob.address)).to.be.within(309 - this.tokenOffset, 359 + this.tokenOffset);
    //         expect(await this.partnerToken.balanceOf(this.bob.address)).to.be.within(247 - this.tokenOffset, 287 + this.tokenOffset);

    //         expect(await this.solar.balanceOf(this.carol.address)).to.equal("0");
    //         expect(await this.partnerToken.balanceOf(this.carol.address)).to.equal("0");

    //         expect(await this.solar.balanceOf(this.dev.address)).to.be.within(400 - this.tokenOffset, 420 + this.tokenOffset);
    //         expect(await this.solar.balanceOf(this.treasury.address)).to.be.within(400 - this.tokenOffset, 420 + this.tokenOffset);
    //         expect(await this.solar.balanceOf(this.investor.address)).to.be.within(200 - this.tokenOffset, 210 + this.tokenOffset);
    //         expect(await this.solar.balanceOf(this.chef.address)).to.be.within(408 - this.tokenOffset, 508 + this.tokenOffset);
    //         // Alice withdraws 20 LPs at t+40
    //         // Bob withdraws 15 LPs at t+50
    //         // Carol withdraws 30 LPs at t+60
    //         await advanceTimeAndBlock(9); // t+39
    //         await this.chef.connect(this.alice).withdraw(0, "20", { from: this.alice.address }); // t+40
    //         await advanceTimeAndBlock(9); // t+49
    //         await this.chef.connect(this.bob).withdraw(0, "15", { from: this.bob.address }); // t+50
    //         await advanceTimeAndBlock(9); // t+59
    //         await this.chef.connect(this.carol).withdraw(0, "30", { from: this.carol.address }); // t+60
    //         expect(await this.solar.totalSupply()).to.be.within(5000, 5100);
    //         // Alice should have:
    //         //  - 283 + 10*50*2/7 + 10*50*20/65 = 579 (+50) SolarBeamToken
    //         //  - 226 + 10*40*2/7 + 10*40*20/65 = 463 (+40) PartnerToken
    //         expect(await this.solar.balanceOf(this.alice.address)).to.be.within(579 - this.tokenOffset, 629 + this.tokenOffset);
    //         expect(await this.partnerToken.balanceOf(this.alice.address)).to.be.within(463 - this.tokenOffset, 503 + this.tokenOffset);
    //         // Bob should have:
    //         //  - 309 + 10*50*15/65 + 10*50*15/45 = 591 (+50) SolarBeamToken
    //         //  - 247 + 10*40*15/65 + 10*40*15/45 = 472 (+40) PartnerToken
    //         expect(await this.solar.balanceOf(this.bob.address)).to.be.within(591 - this.tokenOffset, 641 + this.tokenOffset);
    //         expect(await this.partnerToken.balanceOf(this.bob.address)).to.be.within(472 - this.tokenOffset, 512 + this.tokenOffset);
    //         // Carol should have:
    //         //  - 2*50*3/6 + 10*50*3/7 + 10*50*30/65 + 10*50*30/45 + 10*50 = 1328 (+50) SolarBeamToken
    //         //  - 2*40*1/2 + 10*40*3/7 + 10*40*30/65 + 10*40*30/45 + 10*40 = 1062 (+40) PartnerToken
    //         expect(await this.solar.balanceOf(this.carol.address)).to.be.within(1328 - this.tokenOffset, 1378 + this.tokenOffset);
    //         expect(await this.partnerToken.balanceOf(this.carol.address)).to.be.within(1062 - this.tokenOffset, 1102 + this.tokenOffset);
    //         // Dev should have: 50*20 = 1000 (+20)
    //         // Treasury should have: 50*20 = 1000 (+20)
    //         // Investor should have: 50*10 = 500 (+10)
    //         expect(await this.solar.balanceOf(this.dev.address)).to.be.within(1000 - this.tokenOffset, 1020 + this.tokenOffset);
    //         expect(await this.solar.balanceOf(this.treasury.address)).to.be.within(1000 - this.tokenOffset, 1020 + this.tokenOffset);
    //         expect(await this.solar.balanceOf(this.investor.address)).to.be.within(500 - this.tokenOffset, 510 + this.tokenOffset);
    //         // MasterChefJoe should have nothing
    //         expect(await this.solar.balanceOf(this.chef.address)).to.be.within(0, 0 + this.tokenOffset);

    //         // // All of them should have 1000 LPs back.
    //         expect(await this.lp.balanceOf(this.alice.address)).to.equal("1000");
    //         expect(await this.lp.balanceOf(this.bob.address)).to.equal("1000");
    //         expect(await this.lp.balanceOf(this.carol.address)).to.equal("1000");
    //     });

    //     it("should give proper JOEs allocation to each pool", async function () {
    //         const startTime = (await latest()).add(60);
    //         this.chef = await this.MCV2.deploy(this.solar.address, this.dev.address, this.treasury.address, this.investor.address, this.solarPerSec, startTime, this.devPercent, this.treasuryPercent, this.investorPercent);
    //         await this.chef.deployed(); // t-59

    //         this.rewarder = await this.SimpleRewarderPerSec.deploy(this.partnerToken.address, this.lp.address, this.partnerRewardPerSec, this.chef.address, false);
    //         await this.rewarder.deployed(); // t-58

    //         await this.partnerToken.mint(this.rewarder.address, "1000000000000000000000000"); // t-57

    //         await this.solar.transferOwnership(this.chef.address); // t-56

    //         await this.lp.connect(this.alice).approve(this.chef.address, "1000", { from: this.alice.address }); // t-55
    //         await this.lp2.connect(this.bob).approve(this.chef.address, "1000", { from: this.bob.address }); // t-54
    //         // Add first LP to the pool with allocation 10
    //         await this.chef.add("10", this.lp.address, this.rewarder.address); // t-53
    //         // Alice deposits 10 LPs at t+10
    //         await advanceTimeAndBlock(62); // t+9
    //         await this.chef.connect(this.alice).deposit(0, "10", { from: this.alice.address }); // t+10
    //         // Add LP2 to the pool with allocation 20 at t+20
    //         await advanceTimeAndBlock(9); // t+19
    //         await this.chef.add("20", this.lp2.address, ADDRESS_ZERO); // t+20
    //         // Alice's pending reward should be:
    //         //   - 10*50 = 500 (+50) SolarBeamToken
    //         //   - 10*40 = 400 (+40)  PartnerToken
    //         expect((await this.chef.pendingTokens(0, this.alice.address)).pendingJoe).to.be.within(500 - this.tokenOffset, 550 + this.tokenOffset);
    //         expect(await this.rewarder.pendingTokens(this.alice.address)).to.be.within(400, 440);
    //         // Bob deposits 10 LP2s at t+25
    //         await advanceTimeAndBlock(4); // t+24
    //         await this.chef.connect(this.bob).deposit(1, "10", { from: this.bob.address }); // t+25
    //         // Alice's pending reward should be:
    //         //   - 500 + 5*1/3*50 = 583 (+50) SolarBeamToken
    //         //   - 400 + 5*40 = 600 (+40) PartnerToken
    //         expect((await this.chef.pendingTokens(0, this.alice.address)).pendingJoe).to.be.within(583 - this.tokenOffset, 633 + this.tokenOffset);
    //         expect(await this.rewarder.pendingTokens(this.alice.address)).to.be.within(600, 640);

    //         // At this point:
    //         //   Alice's pending reward should be:
    //         //     - 583 + 5*1/3*50 = 666 (+50) SolarBeamToken
    //         //     - 600 + 5*40 = 800 (+40) PartnerToken
    //         // Bob's pending reward should be:
    //         //     - 5*2/3*50 = 166 (+50) SolarBeamToken
    //         //     - 0 PartnerToken
    //         await advanceTimeAndBlock(5); // t+30
    //         expect((await this.chef.pendingTokens(0, this.alice.address)).pendingJoe).to.be.within(666 - this.tokenOffset, 716 + this.tokenOffset);
    //         expect(await this.rewarder.pendingTokens(this.alice.address)).to.be.within(800, 840);

    //         expect((await this.chef.pendingTokens(1, this.bob.address)).pendingJoe).to.be.within(166 - this.tokenOffset, 216 + this.tokenOffset);
    //         expect(await this.rewarder.pendingTokens(this.bob.address)).to.equal(0);

    //         // Alice and Bob should not have pending rewards in pools they're not staked in
    //         expect((await this.chef.pendingTokens(1, this.alice.address)).pendingJoe).to.equal("0");
    //         expect((await this.chef.pendingTokens(0, this.bob.address)).pendingJoe).to.equal("0");

    //         // Make sure they have receive the same amount as what was pending
    //         await this.chef.connect(this.alice).withdraw(0, "10", { from: this.alice.address }); // t+31
    //         // Alice should have:
    //         //   - 666 + 1*1/3*50 = 682 (+50) SolarBeamToken
    //         //   - 800 + 1*40 = 840 (+40) PartnerToken
    //         expect(await this.solar.balanceOf(this.alice.address)).to.be.within(682 - this.tokenOffset, 732 + this.tokenOffset);
    //         expect(await this.partnerToken.balanceOf(this.alice.address)).to.be.within(840, 880);

    //         await this.chef.connect(this.bob).withdraw(1, "5", { from: this.bob.address }); // t+32
    //         // Bob should have:
    //         //   - 166 + 2*2/3*50 = 232 (+50) SolarBeamToken
    //         //   - 0 PartnerToken
    //         expect(await this.solar.balanceOf(this.bob.address)).to.be.within(232 - this.tokenOffset, 282 + this.tokenOffset);
    //         expect(await this.rewarder.pendingTokens(this.bob.address)).to.equal(0);
    //     });

    //     it("should give proper JOEs after updating emission rate", async function () {
    //         const startTime = (await latest()).add(60);
    //         this.chef = await this.MCV2.deploy(this.solar.address, this.dev.address, this.treasury.address, this.investor.address, this.solarPerSec, startTime, this.devPercent, this.treasuryPercent, this.investorPercent);
    //         await this.chef.deployed(); // t-59

    //         this.rewarder = await this.SimpleRewarderPerSec.deploy(this.partnerToken.address, this.lp.address, this.partnerRewardPerSec, this.chef.address, false);
    //         await this.rewarder.deployed(); // t-58

    //         await this.partnerToken.mint(this.rewarder.address, "1000000000000000000000000"); // t-57

    //         await this.solar.transferOwnership(this.chef.address); // t-56

    //         await this.lp.connect(this.alice).approve(this.chef.address, "1000", { from: this.alice.address }); // t-55
    //         await this.chef.add("10", this.lp.address, this.rewarder.address); // t-54
    //         // Alice deposits 10 LPs at t+10
    //         await advanceTimeAndBlock(63); // t+9
    //         await this.chef.connect(this.alice).deposit(0, "10", { from: this.alice.address }); // t+10
    //         // At t+110, Alice should have:
    //         //   - 100*100*0.5 = 5000 (+50) SolarBeamToken
    //         //   - 100*40 = 4000 (+40) PartnerToken
    //         await advanceTimeAndBlock(100); // t+110
    //         expect((await this.chef.pendingTokens(0, this.alice.address)).pendingJoe).to.be.within(5000, 5050);
    //         expect(await this.rewarder.pendingTokens(this.alice.address)).to.be.within(4000, 4040);
    //         // Lower JOE emission rate to 40 JOE per sec
    //         await this.chef.updateEmissionRate(40); // t+111
    //         // At t+115, Alice should have:
    //         //   - 5000 + 1*100*0.5 + 4*40*0.5 = 5130 (+50) SolarBeamToken
    //         //   - 4000 + 5*40 = 4200 (+40) PartnerToken
    //         await advanceTimeAndBlock(4); // t+115
    //         expect((await this.chef.pendingTokens(0, this.alice.address)).pendingJoe).to.be.within(5130, 5180);
    //         expect(await this.rewarder.pendingTokens(this.alice.address)).to.be.within(4200, 4240);
    //         // Increase PartnerToken emission rate to 90 PartnerToken per block
    //         await this.rewarder.setRewardRate(90); // t+116
    //         // At b=35, Alice should have:
    //         //   - 5130 + 21*40*0.5 = 5550 (+50) SolarBeamToken
    //         //   - 4200 + 1*40 + 20*90 = 6040 (+90) PartnerToken
    //         await advanceTimeAndBlock(20); // t+136
    //         expect((await this.chef.pendingTokens(0, this.alice.address)).pendingJoe).to.be.within(5550, 5600);
    //         expect(await this.rewarder.pendingTokens(this.alice.address)).to.be.within(6040, 6130);
    //     });
    // });

    // context("With ERC/LP token added to the field and using MasterChefRewarderPerBlock", function () {
    //     beforeEach(async function () {
    //         this.lp = await this.ERC20Mock.deploy("LPToken", "LP", "10000000000"); // b=3
    //         await this.lp.transfer(this.alice.address, "1000"); // b=4
    //         await this.lp.transfer(this.bob.address, "1000"); // b=5
    //         await this.lp.transfer(this.carol.address, "1000"); // b=6

    //         this.lp2 = await this.ERC20Mock.deploy("LPToken2", "LP2", "10000000000"); // b=7
    //         await this.lp2.transfer(this.alice.address, "1000"); // b=8
    //         await this.lp2.transfer(this.bob.address, "1000"); // b=9
    //         await this.lp2.transfer(this.carol.address, "1000"); // b=10

    //         this.dummyToken = await this.ERC20Mock.deploy("DummyToken", "DUMMY", "1"); // b=11
    //         await this.dummyToken.transfer(this.partnerDev.address, "1"); // b=12

    //         this.partnerChef = await this.MCV1PerBlock.deploy(this.partnerToken.address, this.partnerDev.address, this.partnerRewardPerBlock, this.partnerStartBlock, this.partnerBonusEndBlock); // b=13
    //         await this.partnerChef.deployed();
    //     });

    //     it("should check LP token is a contract", async function () {
    //         const startTime = (await latest()).add(60);
    //         this.chef = await this.MCV2.deploy(this.solar.address, this.dev.address, this.treasury.address, this.investor.address, this.solarPerSec, startTime, this.devPercent, this.treasuryPercent, this.investorPercent);
    //         await this.chef.deployed();

    //         // Use address that is not a contract
    //         await expect(this.chef.add("100", this.dev.address, ADDRESS_ZERO)).to.be.revertedWith("add: LP token must be a valid contract");
    //     });

    //     it("should not allow same LP token to be added twice", async function () {
    //         const startTime = (await latest()).add(60);
    //         this.chef = await this.MCV2.deploy(this.solar.address, this.dev.address, this.treasury.address, this.investor.address, this.solarPerSec, startTime, this.devPercent, this.treasuryPercent, this.investorPercent);
    //         await this.chef.deployed();
    //         expect(await this.chef.poolLength()).to.equal("0");

    //         await this.chef.add("100", this.lp.address, ADDRESS_ZERO);
    //         expect(await this.chef.poolLength()).to.equal("1");
    //         await expect(this.chef.add("100", this.lp.address, ADDRESS_ZERO)).to.be.revertedWith("add: LP already added");
    //     });

    //     it("should check rewarder's arguments are contracts", async function () {
    //         await expect(this.MasterChefRewarderPerBlock.deploy(ADDRESS_ZERO, this.lp.address, this.partnerRewardPerBlock, this.partnerChefAllocPoint, this.partnerChefPid, this.partnerChef.address, this.chef.address)).to.be.revertedWith("constructor: reward token must be a valid contract");

    //         await expect(this.MasterChefRewarderPerBlock.deploy(this.partnerToken.address, ADDRESS_ZERO, this.partnerRewardPerBlock, this.partnerChefAllocPoint, this.partnerChefPid, this.partnerChef.address, this.chef.address)).to.be.revertedWith("constructor: LP token must be a valid contract");

    //         await expect(this.MasterChefRewarderPerBlock.deploy(this.partnerToken.address, this.lp.address, this.partnerRewardPerBlock, this.partnerChefAllocPoint, this.partnerChefPid, ADDRESS_ZERO, this.chef.address)).to.be.revertedWith("constructor: MasterChef must be a valid contract");

    //         await expect(this.MasterChefRewarderPerBlock.deploy(this.partnerToken.address, this.lp.address, this.partnerRewardPerBlock, this.partnerChefAllocPoint, this.partnerChefPid, this.partnerChef.address, ADDRESS_ZERO)).to.be.revertedWith(
    //             "constructor: MasterChefJoeV2 must be a valid contract"
    //         );
    //     });

    //     it("should check rewarder added and set properly", async function () {
    //         const startTime = (await latest()).add(60);
    //         this.chef = await this.MCV2.deploy(this.solar.address, this.dev.address, this.treasury.address, this.investor.address, this.solarPerSec, startTime, this.devPercent, this.treasuryPercent, this.investorPercent);
    //         await this.chef.deployed();

    //         this.rewarder = await this.MasterChefRewarderPerBlock.deploy(this.partnerToken.address, this.lp.address, this.partnerRewardPerBlock, this.partnerChefAllocPoint, this.partnerChefPid, this.partnerChef.address, this.chef.address);
    //         await this.rewarder.deployed();

    //         // Try to add rewarder that is neither zero address or contract address
    //         await expect(this.chef.add("100", this.lp.address, this.dev.address)).to.be.revertedWith("add: rewarder must be contract or zero");

    //         await this.chef.add("100", this.lp.address, this.rewarder.address);

    //         // Try to set rewarder that is neither zero address or contract address
    //         await expect(this.chef.set("0", "200", this.dev.address, true)).to.be.revertedWith("set: rewarder must be contract or zero");

    //         await this.chef.set("0", "200", this.rewarder.address, false);
    //         expect((await this.chef.poolInfo(0)).allocPoint).to.equal("200");

    //         // Alice has no DummyToken, so it should fail to init
    //         await expect(this.rewarder.connect(this.alice).init(this.dummyToken.address)).to.be.revertedWith("init: Balance must exceed 0");

    //         // Successfully init the rewarder
    //         await this.partnerChef.add(this.partnerChefAllocPoint, this.dummyToken.address, true);
    //         await this.dummyToken.connect(this.partnerDev).approve(this.rewarder.address, "1");
    //         await this.rewarder.connect(this.partnerDev).init(this.dummyToken.address);
    //         expect((await this.partnerChef.poolInfo(this.partnerChefPid)).lpToken).to.equal(this.dummyToken.address);
    //     });

    //     it("should allow a given pool's allocation weight and rewarder to be updated", async function () {
    //         const startTime = (await latest()).add(60);
    //         this.chef = await this.MCV2.deploy(this.solar.address, this.dev.address, this.treasury.address, this.investor.address, this.solarPerSec, startTime, this.devPercent, this.treasuryPercent, this.investorPercent);
    //         await this.chef.deployed();

    //         this.rewarder = await this.MasterChefRewarderPerBlock.deploy(this.partnerToken.address, this.lp.address, this.partnerRewardPerBlock, this.partnerChefAllocPoint, this.partnerChefPid, this.partnerChef.address, this.chef.address);
    //         await this.rewarder.deployed();

    //         await this.chef.add("100", this.lp.address, ADDRESS_ZERO);
    //         expect((await this.chef.poolInfo(0)).allocPoint).to.equal("100");
    //         expect((await this.chef.poolInfo(0)).rewarder).to.equal(ADDRESS_ZERO);

    //         await this.chef.set("0", "150", this.rewarder.address, true);
    //         expect((await this.chef.poolInfo(0)).allocPoint).to.equal("150");
    //         expect((await this.chef.poolInfo(0)).rewarder).to.equal(this.rewarder.address);
    //     });

    //     it("should only allow MasterChefJoeV2 to call onJoeReward", async function () {
    //         const startTime = (await latest()).add(60);
    //         this.chef = await this.MCV2.deploy(this.solar.address, this.dev.address, this.treasury.address, this.investor.address, this.solarPerSec, startTime, this.devPercent, this.treasuryPercent, this.investorPercent);
    //         await this.chef.deployed(); // t-59, b=14

    //         this.rewarder = await this.MasterChefRewarderPerBlock.deploy(this.partnerToken.address, this.lp.address, this.partnerRewardPerBlock, this.partnerChefAllocPoint, this.partnerChefPid, this.partnerChef.address, this.chef.address);
    //         await this.rewarder.deployed(); // t-58, b=15

    //         await this.partnerToken.transferOwnership(this.partnerChef.address); // t-57, b=16
    //         await this.partnerChef.add(this.partnerChefAllocPoint, this.dummyToken.address, true); // t-56, b=17

    //         await this.dummyToken.connect(this.partnerDev).approve(this.rewarder.address, "1"); // t-55, b=18
    //         await this.rewarder.connect(this.partnerDev).init(this.dummyToken.address); // t-54, b=19

    //         await this.solar.transferOwnership(this.chef.address); // t-53, b=20

    //         await this.chef.add("100", this.lp.address, this.rewarder.address); // t-52, b=21

    //         await this.lp.connect(this.bob).approve(this.chef.address, "1000"); // t-51, b=22
    //         await this.chef.connect(this.bob).deposit(0, "100"); // t-50, b=23
    //         await advanceTimeAndBlock(39); // t-11, b=24

    //         await expect(this.rewarder.onJoeReward(this.bob.address, "100")).to.be.revertedWith("onlyMCV2: only MasterChef V2 can call this function"); // t-10, b=25
    //         await this.chef.connect(this.bob).deposit(0, "0"); // t-9, b=26
    //         // Bob should have:
    //         //   - 0 SolarBeamToken
    //         //   - 3*40 = 80 PartnerToken
    //         expect(await this.solar.balanceOf(this.bob.address)).to.equal("0");
    //         expect(await this.partnerToken.balanceOf(this.bob.address)).to.equal("120");
    //     });

    //     it("should allow rewarder to be set and removed mid farming", async function () {
    //         const startTime = (await latest()).add(60);
    //         this.chef = await this.MCV2.deploy(this.solar.address, this.dev.address, this.treasury.address, this.investor.address, this.solarPerSec, startTime, this.devPercent, this.treasuryPercent, this.investorPercent);
    //         await this.chef.deployed(); // t-59, b=14

    //         this.rewarder = await this.MasterChefRewarderPerBlock.deploy(this.partnerToken.address, this.lp.address, this.partnerRewardPerBlock, this.partnerChefAllocPoint, this.partnerChefPid, this.partnerChef.address, this.chef.address);
    //         await this.rewarder.deployed(); // t-58, b=15

    //         await this.partnerToken.transferOwnership(this.partnerChef.address); // t-57, b=16
    //         await this.partnerChef.add(this.partnerChefAllocPoint, this.dummyToken.address, true); // t-56, b=17

    //         await this.dummyToken.connect(this.partnerDev).approve(this.rewarder.address, "1"); // t-55, b=18
    //         await this.rewarder.connect(this.partnerDev).init(this.dummyToken.address); // t-54, b=19

    //         await this.solar.transferOwnership(this.chef.address); // t-53, b=20

    //         await this.chef.add("100", this.lp.address, ADDRESS_ZERO); // t-52, b=21

    //         await this.lp.connect(this.bob).approve(this.chef.address, "1000"); // t-51, b=22
    //         await this.chef.connect(this.bob).deposit(0, "100"); // t-50, b=23
    //         await advanceTimeAndBlock(39); // t-11, b=24

    //         await this.chef.connect(this.bob).deposit(0, "0"); // t-10, b=25
    //         expect(await this.solar.balanceOf(this.bob.address)).to.equal("0");
    //         // At t+10, Bob should have pending:
    //         //   - 10*50 = 500 (+50) SolarBeamToken
    //         //   - 0 PartnerToken
    //         await advanceTimeAndBlock(20); // t+10, b=26
    //         expect((await this.chef.pendingTokens(0, this.bob.address)).pendingJoe).to.be.within(500, 550);
    //         expect((await this.chef.pendingTokens(0, this.bob.address)).bonusTokenAddress).to.equal(ADDRESS_ZERO);
    //         expect((await this.chef.pendingTokens(0, this.bob.address)).pendingBonusToken).to.equal(0);

    //         // Pass rewarder but don't overwrite
    //         await this.chef.set(0, 100, this.rewarder.address, false); // t+11 ,b=27

    //         // At t+20, Bob should have pending:
    //         //   - 500 + 10*50 = 1000 (+50) SolarBeamToken
    //         //   - 0 PartnerToken
    //         await advanceTimeAndBlock(9); // t+20, b=28
    //         expect((await this.chef.pendingTokens(0, this.bob.address)).pendingJoe).to.be.within(1000, 1050);
    //         expect((await this.chef.pendingTokens(0, this.bob.address)).bonusTokenAddress).to.equal(ADDRESS_ZERO);
    //         expect((await this.chef.pendingTokens(0, this.bob.address)).pendingBonusToken).to.equal(0);

    //         // Pass rewarder and overwrite
    //         await this.chef.set(0, 100, this.rewarder.address, true); // t+21, b=29

    //         // At t+30, Bob should have pending:
    //         //   - 1000 + 10*50 = 1500 (+50) SolarBeamToken
    //         //   - 0 PartnerToken - this is because rewarder hasn't registered the user yet! User needs to call deposit again
    //         await advanceTimeAndBlock(4); // t+25, b=30
    //         await advanceTimeAndBlock(5); // t+30, b=31
    //         expect((await this.chef.pendingTokens(0, this.bob.address)).pendingJoe).to.be.within(1500, 1550);
    //         expect((await this.chef.pendingTokens(0, this.bob.address)).bonusTokenAddress).to.equal(this.partnerToken.address);
    //         expect((await this.chef.pendingTokens(0, this.bob.address)).bonusTokenSymbol).to.equal("SUSHI");
    //         expect((await this.chef.pendingTokens(0, this.bob.address)).pendingBonusToken).to.equal(0);

    //         // Call deposit to start receiving PartnerTokens
    //         await this.chef.connect(this.bob).deposit(0, 0); // t+31, b=32

    //         // At t+40, Bob should have pending:
    //         //   - 9*50 = 450 (+50) SolarBeamToken
    //         //   - 2*40 = 80 PartnerToken
    //         await advanceTimeAndBlock(4); // t+35, b=33
    //         await advanceTimeAndBlock(5); // t+40, b=34
    //         expect((await this.chef.pendingTokens(0, this.bob.address)).pendingJoe).to.be.within(450, 500);
    //         expect((await this.chef.pendingTokens(0, this.bob.address)).bonusTokenAddress).to.equal(this.partnerToken.address);
    //         expect((await this.chef.pendingTokens(0, this.bob.address)).bonusTokenSymbol).to.equal("SUSHI");
    //         expect((await this.chef.pendingTokens(0, this.bob.address)).pendingBonusToken).to.equal(80);

    //         // Set reward rate to zero
    //         await this.rewarder.setRewardRate(0); // t+41, b=35

    //         // At t+50, Bob should have pending:
    //         //   - 450 + 10*50 = 950 (+50) SolarBeamToken
    //         //   - 80 + 1*40 = 120 PartnerToken
    //         await advanceTimeAndBlock(4); // t+45, b=36
    //         await advanceTimeAndBlock(5); // t+50, b=37
    //         expect((await this.chef.pendingTokens(0, this.bob.address)).pendingJoe).to.be.within(950, 1000);
    //         expect((await this.chef.pendingTokens(0, this.bob.address)).bonusTokenAddress).to.equal(this.partnerToken.address);
    //         expect((await this.chef.pendingTokens(0, this.bob.address)).bonusTokenSymbol).to.equal("SUSHI");
    //         expect((await this.chef.pendingTokens(0, this.bob.address)).pendingBonusToken).to.equal(120);

    //         // Claim reward
    //         await this.chef.connect(this.bob).deposit(0, 0); // t+51, b=38

    //         // Bob should have:
    //         //   - 1500 + 1*50 + 950 + 1*50 = 2550 (+50) SolarBeamToken
    //         //   - 120 PartnerToken
    //         expect(await this.solar.balanceOf(this.bob.address)).to.be.within(2550, 2600);
    //         expect(await this.partnerToken.balanceOf(this.bob.address)).to.equal(120);
    //     });

    //     it("should allow allocation point to be set mid farming", async function () {
    //         const startTime = (await latest()).add(60);
    //         this.chef = await this.MCV2.deploy(this.solar.address, this.dev.address, this.treasury.address, this.investor.address, this.solarPerSec, startTime, this.devPercent, this.treasuryPercent, this.investorPercent);
    //         await this.chef.deployed(); // t-59, b=14

    //         this.rewarder = await this.MasterChefRewarderPerBlock.deploy(this.partnerToken.address, this.lp.address, this.partnerRewardPerBlock, this.partnerChefAllocPoint, this.partnerChefPid, this.partnerChef.address, this.chef.address);
    //         await this.rewarder.deployed(); // t-58, b=15

    //         await this.partnerToken.transferOwnership(this.partnerChef.address); // t-57, b=16
    //         await this.partnerChef.add(this.partnerChefAllocPoint, this.dummyToken.address, true); // t-56, b=17
    //         await this.partnerChef.add("200", this.lp2.address, true); // t-55, b=18

    //         await this.dummyToken.connect(this.partnerDev).approve(this.rewarder.address, "1"); // t-54, b=19
    //         await this.rewarder.connect(this.partnerDev).init(this.dummyToken.address); // t-53, b=20

    //         await this.solar.transferOwnership(this.chef.address); // t-52, b=21

    //         await this.chef.add("100", this.lp.address, this.rewarder.address); // t-51, b=22

    //         await this.lp.connect(this.bob).approve(this.chef.address, "1000"); // t-50, b=23
    //         await this.chef.connect(this.bob).deposit(0, "100"); // t-49, b=24
    //         await advanceTimeAndBlock(38); // t-11, b=25

    //         await this.chef.connect(this.bob).deposit(0, "0"); // t-10, b=26
    //         // Bob should have:
    //         //   - 0 SolarBeamToken
    //         //   - 2*40*1/3 = 26 PartnerToken
    //         expect(await this.solar.balanceOf(this.bob.address)).to.equal("0");
    //         expect(await this.partnerToken.balanceOf(this.bob.address)).to.be.within(26 - this.tokenOffset, 26 + this.tokenOffset);
    //         await advanceTimeAndBlock(8); // t-2, b=27

    //         await this.chef.connect(this.bob).deposit(0, "0"); // t-1, b=28
    //         expect(await this.solar.balanceOf(this.bob.address)).to.equal("0");
    //         await advanceTimeAndBlock(10); // t+9, b=29

    //         await this.chef.connect(this.bob).deposit(0, "0"); // t+10, b=30
    //         // Bob should have:
    //         //   - 10*50 = 500 (+50) SolarBeamToken
    //         //   - 26 + 4*40*1/3 = 79 PartnerToken
    //         expect(await this.solar.balanceOf(this.bob.address)).to.be.within(500, 550);
    //         expect(await this.partnerToken.balanceOf(this.bob.address)).to.be.within(79 - this.tokenOffset, 79 + this.tokenOffset);

    //         // Increase pool 1's alloc point
    //         //   For a brief amount of time, the rewarder is emitting 40/4 = 10 tokens per block because the total allocPoint
    //         //   has increased to 400, but the pool alloc point on the rewarder has not been increased yet.
    //         await this.partnerChef.set(0, "200", true); // t+11, b=31
    //         await this.rewarder.updatePool(); // t+12, b=32
    //         await this.rewarder.setAllocPoint(200); // t+13, b=33

    //         await advanceTimeAndBlock(2); // t+15, b=34
    //         await advanceTimeAndBlock(5); // t+20, b=35
    //         await advanceTimeAndBlock(9); // t+29, b=36

    //         await this.chef.connect(this.bob).deposit(0, 0); // t+30, b=37

    //         // Bob should have:
    //         //   - 500 + 20*50 = 1500 (+50) SolarBeamToken
    //         //   - 79 + 3*40*1/4 + 4*40*1/2 = 189 PartnerToken
    //         expect(await this.solar.balanceOf(this.bob.address)).to.be.within(1500, 1550);
    //         expect(await this.partnerToken.balanceOf(this.bob.address)).to.be.within(189 - this.tokenOffset, 189 + this.tokenOffset);
    //     });

    //     it("should give out JOEs only after farming time", async function () {
    //         const startTime = (await latest()).add(60);
    //         this.chef = await this.MCV2.deploy(this.solar.address, this.dev.address, this.treasury.address, this.investor.address, this.solarPerSec, startTime, this.devPercent, this.treasuryPercent, this.investorPercent);
    //         await this.chef.deployed(); // t-59, b=14

    //         this.rewarder = await this.MasterChefRewarderPerBlock.deploy(this.partnerToken.address, this.lp.address, this.partnerRewardPerBlock, this.partnerChefAllocPoint, this.partnerChefPid, this.partnerChef.address, this.chef.address);
    //         await this.rewarder.deployed(); // t-58, b=15

    //         await this.partnerToken.transferOwnership(this.partnerChef.address); // t-57, b=16
    //         await this.partnerChef.add(this.partnerChefAllocPoint, this.dummyToken.address, true); // t-56, b=17

    //         await this.dummyToken.connect(this.partnerDev).approve(this.rewarder.address, "1"); // t-55, b=18
    //         await this.rewarder.connect(this.partnerDev).init(this.dummyToken.address); // t-54, b=19

    //         await this.solar.transferOwnership(this.chef.address); // t-53, b=20

    //         await this.chef.add("100", this.lp.address, this.rewarder.address); // t-52, b=21

    //         await this.lp.connect(this.bob).approve(this.chef.address, "1000"); // t-51, b=22
    //         await this.chef.connect(this.bob).deposit(0, "100"); // t-50, b=23
    //         await advanceTimeAndBlock(39); // t-11, b=24

    //         await this.chef.connect(this.bob).deposit(0, "0"); // t-10, b=25
    //         // Bob should have:
    //         //   - 0 SolarBeamToken
    //         //   - 2*40 = 80 PartnerToken
    //         expect(await this.solar.balanceOf(this.bob.address)).to.equal("0");
    //         expect(await this.partnerToken.balanceOf(this.bob.address)).to.equal("80");
    //         await advanceTimeAndBlock(8); // t-2, b=26

    //         await this.chef.connect(this.bob).deposit(0, "0"); // t-1, b=27
    //         expect(await this.solar.balanceOf(this.bob.address)).to.equal("0");
    //         await advanceTimeAndBlock(10); // t+9, b=28

    //         await this.chef.connect(this.bob).deposit(0, "0"); // t+10, b=29
    //         // Bob should have:
    //         //   - 10*50 = 500 (+50) SolarBeamToken
    //         //   - 80 + 4*40 = 240 PartnerToken
    //         expect(await this.solar.balanceOf(this.bob.address)).to.be.within(500, 550);
    //         expect(await this.partnerToken.balanceOf(this.bob.address)).to.equal("240");

    //         await advanceTimeAndBlock(4); // t+14, b=30
    //         await this.chef.connect(this.bob).deposit(0, "0"); // t+15, b=31

    //         // At this point:
    //         //   Bob should have:
    //         //     - 500 + 5*50 = 750 (+50) SolarBeamToken
    //         //     - 240 + 2*40 = 320 PartnerToken
    //         //   Dev should have: 15*20 = 300 (+20)
    //         //   Treasury should have: 15*20 = 300 (+20)
    //         //   Investor should have: 15*10 = 150 (+10)
    //         expect(await this.solar.balanceOf(this.bob.address)).to.be.within(750, 800);
    //         expect(await this.partnerToken.balanceOf(this.bob.address)).to.equal("320");
    //         expect(await this.solar.balanceOf(this.dev.address)).to.be.within(300, 320);
    //         expect(await this.solar.balanceOf(this.treasury.address)).to.be.within(300, 320);
    //         expect(await this.solar.balanceOf(this.investor.address)).to.be.within(150, 160);
    //         expect(await this.solar.totalSupply()).to.be.within(1500, 1600);
    //     });

    //     it("should not distribute JOEs if no one deposit", async function () {
    //         const startTime = (await latest()).add(60);
    //         this.chef = await this.MCV2.deploy(this.solar.address, this.dev.address, this.treasury.address, this.investor.address, this.solarPerSec, startTime, this.devPercent, this.treasuryPercent, this.investorPercent);
    //         await this.chef.deployed(); // t-59, b=14

    //         this.rewarder = await this.MasterChefRewarderPerBlock.deploy(this.partnerToken.address, this.lp.address, this.partnerRewardPerBlock, this.partnerChefAllocPoint, this.partnerChefPid, this.partnerChef.address, this.chef.address);
    //         await this.rewarder.deployed(); // t-58, b=15

    //         await this.partnerToken.transferOwnership(this.partnerChef.address); // t-57, b=16
    //         await this.partnerChef.add(this.partnerChefAllocPoint, this.dummyToken.address, true); // t-56, b=17

    //         await this.dummyToken.connect(this.partnerDev).approve(this.rewarder.address, "1"); // t-55, b=18
    //         await this.rewarder.connect(this.partnerDev).init(this.dummyToken.address); // t-54, b=19

    //         await this.solar.transferOwnership(this.chef.address); // t-53, b=20

    //         await this.chef.add("100", this.lp.address, this.rewarder.address); // t-52, b=21
    //         await this.lp.connect(this.bob).approve(this.chef.address, "1000"); // t-51, b=22
    //         await advanceTimeAndBlock(105); // t+54, b=23

    //         expect(await this.solar.totalSupply()).to.equal("0");
    //         expect(await this.partnerToken.balanceOf(this.bob.address)).to.equal("0");
    //         await advanceTimeAndBlock(5); // t+59, b=24
    //         expect(await this.solar.totalSupply()).to.equal("0");
    //         expect(await this.partnerToken.balanceOf(this.bob.address)).to.equal("0");
    //         await advanceTimeAndBlock(5); // t+64, b=25
    //         await this.chef.connect(this.bob).deposit(0, "10"); // t+65, b=26
    //         expect(await this.solar.totalSupply()).to.equal("0");
    //         expect(await this.solar.balanceOf(this.bob.address)).to.equal("0");
    //         expect(await this.partnerToken.balanceOf(this.bob.address)).to.equal("0");
    //         expect(await this.solar.balanceOf(this.dev.address)).to.equal("0");
    //         expect(await this.lp.balanceOf(this.bob.address)).to.equal("990");
    //         await advanceTimeAndBlock(10); // t+75, b=27
    //         // Revert if Bob withdraws more than he deposited
    //         await expect(this.chef.connect(this.bob).withdraw(0, "11")).to.be.revertedWith("withdraw: not good"); // t+76, b=28
    //         await this.chef.connect(this.bob).withdraw(0, "10"); // t+77, b=29

    //         // At this point:
    //         //   Bob should have:
    //         //     - 12*50 = 600 (+50) SolarBeamToken
    //         //     - 3*40 = 120 PartnerToken
    //         //  Dev should have:
    //         //     - 12*20 = 240 (+20) SolarBeamToken
    //         //  Treasury should have:
    //         //     - 12*20 = 240 (+20) SolarBeamToken
    //         //  Investor should have:
    //         //    - 12*10 = 120 (+10) SolarBeamToken
    //         expect(await this.solar.totalSupply()).to.be.within(1200, 1300);
    //         expect(await this.solar.balanceOf(this.bob.address)).to.be.within(600, 650);
    //         expect(await this.solar.balanceOf(this.dev.address)).to.be.within(240, 260);
    //         expect(await this.solar.balanceOf(this.treasury.address)).to.be.within(240, 260);
    //         expect(await this.solar.balanceOf(this.investor.address)).to.be.within(120, 130);
    //         expect(await this.partnerToken.balanceOf(this.bob.address)).to.equal(120);
    //     });

    //     it("should distribute JOEs properly for each staker", async function () {
    //         const startTime = (await latest()).add(60);
    //         this.chef = await this.MCV2.deploy(this.solar.address, this.dev.address, this.treasury.address, this.investor.address, this.solarPerSec, startTime, this.devPercent, this.treasuryPercent, this.investorPercent);
    //         await this.chef.deployed(); // t-59, b=14

    //         this.rewarder = await this.MasterChefRewarderPerBlock.deploy(this.partnerToken.address, this.lp.address, this.partnerRewardPerBlock, this.partnerChefAllocPoint, this.partnerChefPid, this.partnerChef.address, this.chef.address);
    //         await this.rewarder.deployed(); // t-58, b=15

    //         await this.partnerToken.transferOwnership(this.partnerChef.address); // t-57, b=16
    //         await this.partnerChef.add(this.partnerChefAllocPoint, this.dummyToken.address, true); // t-56, b=17

    //         await this.dummyToken.connect(this.partnerDev).approve(this.rewarder.address, "1"); // t-55, b=18
    //         await this.rewarder.connect(this.partnerDev).init(this.dummyToken.address); // t-54, b=19

    //         await this.solar.transferOwnership(this.chef.address); // t-53, b=20

    //         await this.chef.add("100", this.lp.address, this.rewarder.address); // t-52, b=21
    //         await this.lp.connect(this.alice).approve(this.chef.address, "1000", {
    //             from: this.alice.address,
    //         }); // t-51, b=22
    //         await this.lp.connect(this.bob).approve(this.chef.address, "1000", {
    //             from: this.bob.address,
    //         }); // t-50, b=23
    //         await this.lp.connect(this.carol).approve(this.chef.address, "1000", {
    //             from: this.carol.address,
    //         }); // t-49, b=24

    //         // Alice deposits 10 LPs at t+10
    //         await advanceTimeAndBlock(58); // t+9, b=25
    //         await this.chef.connect(this.alice).deposit(0, "10", { from: this.alice.address }); // t+10, b=26
    //         // Bob deposits 20 LPs at t+14
    //         await advanceTimeAndBlock(3); // t+13, b=27
    //         await this.chef.connect(this.bob).deposit(0, "20"); // t+14, b=28
    //         // Carol deposits 30 LPs at block t+18
    //         await advanceTimeAndBlock(3); // t+17, b=29
    //         await this.chef.connect(this.carol).deposit(0, "30", { from: this.carol.address }); // t+18, b=30
    //         // Alice deposits 10 more LPs at t+20. At this point:
    //         //   Alice should have:
    //         //      - 4*50 + 4*50*1/3 + 2*50*1/6 = 283 (+50) SolarBeamToken
    //         //      - 2*40 + 2*40*1/3 + 2*40*1/6 = 120 PartnerToken
    //         //   Dev should have: 10*20 = 200 (+20)
    //         //   Treasury should have: 10*20 = 200 (+20)
    //         //   Investor should have: 10*10 = 100 (+10)
    //         //   MasterChef should have: 1000 - 283 - 200 - 200 - 100 = 217 (+100)
    //         await advanceTimeAndBlock(1); // t+19, b=31
    //         await this.chef.connect(this.alice).deposit(0, "10", { from: this.alice.address }); // t+20, b=32
    //         expect(await this.solar.totalSupply()).to.be.within(1000, 1100);
    //         // Because LP rewards are divided among participants and rounded down, we account
    //         // for rounding errors with an offset
    //         expect(await this.solar.balanceOf(this.alice.address)).to.be.within(283 - this.tokenOffset, 333 + this.tokenOffset);
    //         expect(await this.partnerToken.balanceOf(this.alice.address)).to.be.within(120 - this.tokenOffset, 120 + this.tokenOffset);

    //         expect(await this.solar.balanceOf(this.bob.address)).to.equal("0");
    //         expect(await this.partnerToken.balanceOf(this.bob.address)).to.equal("0");

    //         expect(await this.solar.balanceOf(this.carol.address)).to.equal("0");
    //         expect(await this.partnerToken.balanceOf(this.carol.address)).to.equal("0");

    //         expect(await this.solar.balanceOf(this.dev.address)).to.be.within(200 - this.tokenOffset, 220 + this.tokenOffset);
    //         expect(await this.solar.balanceOf(this.treasury.address)).to.be.within(200 - this.tokenOffset, 220 + this.tokenOffset);
    //         expect(await this.solar.balanceOf(this.investor.address)).to.be.within(100 - this.tokenOffset, 110 + this.tokenOffset);
    //         expect(await this.solar.balanceOf(this.chef.address)).to.be.within(217 - this.tokenOffset, 317 + this.tokenOffset);
    //         // Bob withdraws 5 LPs at t+30. At this point:
    //         //   Bob should have:
    //         //     - 4*50*2/3 + 2*50*2/6 + 10*50*2/7 = 309 (+50) SolarBeamToken
    //         //     - 2*40*2/3 + 2*40*2/6 + 2*40*2/7 = 102 PartnerToken
    //         //   Dev should have: 20*20= 400 (+20)
    //         //   Treasury should have: 20*20 = 400 (+20)
    //         //   Investor should have: 20*10 = 200 (+10)
    //         //   MasterChef should have: 217 + 1000 - 309 - 200 - 200 - 100 = 408 (+100)
    //         await advanceTimeAndBlock(9); // t+29, b=33
    //         await this.chef.connect(this.bob).withdraw(0, "5", { from: this.bob.address }); // t+30, b=34
    //         expect(await this.solar.totalSupply()).to.be.within(2000, 2100);
    //         // Because of rounding errors, we use token offsets
    //         expect(await this.solar.balanceOf(this.alice.address)).to.be.within(283 - this.tokenOffset, 333 + this.tokenOffset);
    //         expect(await this.partnerToken.balanceOf(this.alice.address)).to.be.within(119 - this.tokenOffset, 119 + this.tokenOffset);

    //         expect(await this.solar.balanceOf(this.bob.address)).to.be.within(309 - this.tokenOffset, 359 + this.tokenOffset);
    //         expect(await this.partnerToken.balanceOf(this.bob.address)).to.be.within(101 - this.tokenOffset, 101 + this.tokenOffset);

    //         expect(await this.solar.balanceOf(this.carol.address)).to.equal("0");
    //         expect(await this.partnerToken.balanceOf(this.carol.address)).to.equal("0");

    //         expect(await this.solar.balanceOf(this.dev.address)).to.be.within(400 - this.tokenOffset, 420 + this.tokenOffset);
    //         expect(await this.solar.balanceOf(this.treasury.address)).to.be.within(400 - this.tokenOffset, 420 + this.tokenOffset);
    //         expect(await this.solar.balanceOf(this.investor.address)).to.be.within(200 - this.tokenOffset, 210 + this.tokenOffset);
    //         expect(await this.solar.balanceOf(this.chef.address)).to.be.within(408 - this.tokenOffset, 508 + this.tokenOffset);
    //         // Alice withdraws 20 LPs at t+40
    //         // Bob withdraws 15 LPs at t+50
    //         // Carol withdraws 30 LPs at t+60
    //         await advanceTimeAndBlock(9); // t+39, b=35
    //         await this.chef.connect(this.alice).withdraw(0, "20", { from: this.alice.address }); // t+40, b=36
    //         await advanceTimeAndBlock(9); // t+49, b=37
    //         await this.chef.connect(this.bob).withdraw(0, "15", { from: this.bob.address }); // t+50, b=38
    //         await advanceTimeAndBlock(9); // t+59, b=39
    //         await this.chef.connect(this.carol).withdraw(0, "30", { from: this.carol.address }); // t+60, b=40
    //         expect(await this.solar.totalSupply()).to.be.within(5000, 5100);
    //         // Alice should have:
    //         //  - 283 + 10*50*2/7 + 10*50*20/65 = 579 (+50) SolarBeamToken
    //         //  - 120 + 2*40*2/7 + 2*40*20/65 = 167 PartnerToken
    //         expect(await this.solar.balanceOf(this.alice.address)).to.be.within(579 - this.tokenOffset, 629 + this.tokenOffset);
    //         expect(await this.partnerToken.balanceOf(this.alice.address)).to.be.within(167 - this.tokenOffset, 167 + this.tokenOffset);
    //         // Bob should have:
    //         //  - 309 + 10*50*15/65 + 10*50*15/45 = 591 (+50) SolarBeamToken
    //         //  - 102 + 2*40*15/65 + 2*40*15/45 = 147 PartnerToken
    //         expect(await this.solar.balanceOf(this.bob.address)).to.be.within(591 - this.tokenOffset, 641 + this.tokenOffset);
    //         expect(await this.partnerToken.balanceOf(this.bob.address)).to.be.within(147 - this.tokenOffset, 147 + this.tokenOffset);
    //         // Carol should have:
    //         //  - 2*50*3/6 + 10*50*3/7 + 10*50*30/65 + 10*50*30/45 + 10*50 = 1328 (+50) SolarBeamToken
    //         //  - 2*40*1/2 + 2*40*3/7 + 2*40*30/65 + 2*40*30/45 + 2*40 = 244 PartnerToken
    //         expect(await this.solar.balanceOf(this.carol.address)).to.be.within(1328 - this.tokenOffset, 1378 + this.tokenOffset);
    //         expect(await this.partnerToken.balanceOf(this.carol.address)).to.be.within(244 - this.tokenOffset, 244 + this.tokenOffset);
    //         // Dev should have: 50*20 = 1000 (+20)
    //         // Treasury should have: 50*20 = 1000 (+20)
    //         // Investor should have: 50*10 = 500 (+10)
    //         expect(await this.solar.balanceOf(this.dev.address)).to.be.within(1000 - this.tokenOffset, 1020 + this.tokenOffset);
    //         expect(await this.solar.balanceOf(this.treasury.address)).to.be.within(1000 - this.tokenOffset, 1020 + this.tokenOffset);
    //         expect(await this.solar.balanceOf(this.investor.address)).to.be.within(500 - this.tokenOffset, 510 + this.tokenOffset);
    //         // MasterChefJoe and PartnerChef should have nothing
    //         expect(await this.solar.balanceOf(this.chef.address)).to.be.within(0, 0 + this.tokenOffset);
    //         expect(await this.partnerToken.balanceOf(this.partnerChef.address)).to.be.within(0, 0 + this.tokenOffset);

    //         // // All of them should have 1000 LPs back.
    //         expect(await this.lp.balanceOf(this.alice.address)).to.equal("1000");
    //         expect(await this.lp.balanceOf(this.bob.address)).to.equal("1000");
    //         expect(await this.lp.balanceOf(this.carol.address)).to.equal("1000");
    //     });

    //     it("should give proper JOEs allocation to each pool", async function () {
    //         const startTime = (await latest()).add(60);
    //         this.chef = await this.MCV2.deploy(this.solar.address, this.dev.address, this.treasury.address, this.investor.address, this.solarPerSec, startTime, this.devPercent, this.treasuryPercent, this.investorPercent);
    //         await this.chef.deployed(); // t-59

    //         this.rewarder = await this.MasterChefRewarderPerBlock.deploy(this.partnerToken.address, this.lp.address, this.partnerRewardPerBlock, this.partnerChefAllocPoint, this.partnerChefPid, this.partnerChef.address, this.chef.address);
    //         await this.rewarder.deployed(); // t-58, b=15

    //         await this.partnerToken.transferOwnership(this.partnerChef.address); // t-57, b=16
    //         await this.partnerChef.add(this.partnerChefAllocPoint, this.dummyToken.address, true); // t-56, b=17

    //         await this.dummyToken.connect(this.partnerDev).approve(this.rewarder.address, "1"); // t-55, b=18
    //         await this.rewarder.connect(this.partnerDev).init(this.dummyToken.address); // t-54, b=19

    //         await this.solar.transferOwnership(this.chef.address); // t-53, b=20

    //         await this.lp.connect(this.alice).approve(this.chef.address, "1000", { from: this.alice.address }); // t-52, b=21
    //         await this.lp2.connect(this.bob).approve(this.chef.address, "1000", { from: this.bob.address }); // t-51, b=22
    //         // Add first LP to the pool with allocation 10
    //         await this.chef.add("10", this.lp.address, this.rewarder.address); // t-50, b=23
    //         // Alice deposits 10 LPs at t+10
    //         await advanceTimeAndBlock(59); // t+9, b=24
    //         await this.chef.connect(this.alice).deposit(0, "10", { from: this.alice.address }); // t+10, b=25
    //         // Add LP2 to the pool with allocation 20 at t+20
    //         await advanceTimeAndBlock(9); // t+19, b=26
    //         await this.chef.add("20", this.lp2.address, ADDRESS_ZERO); // t+20, b=27
    //         // Alice's pending reward should be:
    //         //   - 10*50 = 500 (+50) SolarBeamToken
    //         //   - 2*40 = 80 PartnerToken
    //         expect((await this.chef.pendingTokens(0, this.alice.address)).pendingJoe).to.be.within(500 - this.tokenOffset, 550 + this.tokenOffset);
    //         expect(await this.rewarder.pendingTokens(this.alice.address)).to.equal(80);
    //         // Bob deposits 10 LP2s at t+25
    //         await advanceTimeAndBlock(4); // t+24, b=28
    //         await this.chef.connect(this.bob).deposit(1, "10", { from: this.bob.address }); // t+25, b=29
    //         // Alice's pending reward should be:
    //         //   - 500 + 5*1/3*50 = 583 (+50) SolarBeamToken
    //         //   - 80 + 2*40 = 160 PartnerToken
    //         expect((await this.chef.pendingTokens(0, this.alice.address)).pendingJoe).to.be.within(583 - this.tokenOffset, 633 + this.tokenOffset);
    //         expect(await this.rewarder.pendingTokens(this.alice.address)).to.equal(160);

    //         // At this point:
    //         //   Alice's pending reward should be:
    //         //     - 583 + 5*1/3*50 = 666 (+50) SolarBeamToken
    //         //     - 160 + 1*40 = 200 PartnerToken
    //         // Bob's pending reward should be:
    //         //     - 5*2/3*50 = 166 (+50) SolarBeamToken
    //         //     - 0 PartnerToken
    //         await advanceTimeAndBlock(5); // t+30, b=30
    //         expect((await this.chef.pendingTokens(0, this.alice.address)).pendingJoe).to.be.within(666 - this.tokenOffset, 716 + this.tokenOffset);
    //         expect(await this.rewarder.pendingTokens(this.alice.address)).to.equal(200);

    //         expect((await this.chef.pendingTokens(1, this.bob.address)).pendingJoe).to.be.within(166 - this.tokenOffset, 216 + this.tokenOffset);
    //         expect(await this.rewarder.pendingTokens(this.bob.address)).to.equal(0);

    //         // Alice and Bob should not have pending rewards in pools they're not staked in
    //         expect((await this.chef.pendingTokens(1, this.alice.address)).pendingJoe).to.equal("0");
    //         expect((await this.chef.pendingTokens(0, this.bob.address)).pendingJoe).to.equal("0");

    //         // Make sure they have receive the same amount as what was pending
    //         await this.chef.connect(this.alice).withdraw(0, "10", { from: this.alice.address }); // t+31, b=31
    //         // Alice should have:
    //         //   - 666 + 1*1/3*50 = 682 (+50) SolarBeamToken
    //         //   - 200 + 1*40 = 240 PartnerToken
    //         expect(await this.solar.balanceOf(this.alice.address)).to.be.within(682 - this.tokenOffset, 732 + this.tokenOffset);
    //         expect(await this.partnerToken.balanceOf(this.alice.address)).to.equal(240);

    //         await this.chef.connect(this.bob).withdraw(1, "5", { from: this.bob.address }); // t+32, b=32
    //         // Bob should have:
    //         //   - 166 + 2*2/3*50 = 232 (+50) SolarBeamToken
    //         //   - 0 PartnerToken
    //         expect(await this.solar.balanceOf(this.bob.address)).to.be.within(232 - this.tokenOffset, 282 + this.tokenOffset);
    //         expect(await this.rewarder.pendingTokens(this.bob.address)).to.equal(0);
    //     });

    //     it("should give proper JOEs after updating emission rate", async function () {
    //         const startTime = (await latest()).add(60);
    //         this.chef = await this.MCV2.deploy(this.solar.address, this.dev.address, this.treasury.address, this.investor.address, this.solarPerSec, startTime, this.devPercent, this.treasuryPercent, this.investorPercent);
    //         await this.chef.deployed(); // t-59

    //         this.rewarder = await this.MasterChefRewarderPerBlock.deploy(this.partnerToken.address, this.lp.address, this.partnerRewardPerBlock, this.partnerChefAllocPoint, this.partnerChefPid, this.partnerChef.address, this.chef.address);
    //         await this.rewarder.deployed(); // t-58, b=15

    //         await this.partnerToken.transferOwnership(this.partnerChef.address); // t-57, b=16
    //         await this.partnerChef.add(this.partnerChefAllocPoint, this.dummyToken.address, true); // t-56, b=17

    //         await this.dummyToken.connect(this.partnerDev).approve(this.rewarder.address, "1"); // t-55, b=18
    //         await this.rewarder.connect(this.partnerDev).init(this.dummyToken.address); // t-54, b=19

    //         await this.solar.transferOwnership(this.chef.address); // t-53, b=20

    //         await this.lp.connect(this.alice).approve(this.chef.address, "1000", { from: this.alice.address }); // t-52, b=21
    //         await this.chef.add("10", this.lp.address, this.rewarder.address); // t-51, b=22
    //         // Alice deposits 10 LPs at t+10
    //         await advanceTimeAndBlock(60); // t+9, b=23
    //         await this.chef.connect(this.alice).deposit(0, "10", { from: this.alice.address }); // t+10, b=24
    //         // At t+110, Alice should have:
    //         //   - 100*100*0.5 = 5000 (+50) SolarBeamToken
    //         //   - 1*40 = 40 PartnerToken
    //         await advanceTimeAndBlock(100); // t+110, b=25
    //         expect((await this.chef.pendingTokens(0, this.alice.address)).pendingJoe).to.be.within(5000, 5050);
    //         expect(await this.rewarder.pendingTokens(this.alice.address)).to.equal(40);
    //         // Lower JOE emission rate to 40 JOE per sec
    //         await this.chef.updateEmissionRate(40); // t+111, b=26
    //         // At t+115, Alice should have:
    //         //   - 5000 + 1*100*0.5 + 4*40*0.5 = 5130 (+50) SolarBeamToken
    //         //   - 40 + 2*40 = 120 PartnerToken
    //         await advanceTimeAndBlock(4); // t+115, b=27
    //         expect((await this.chef.pendingTokens(0, this.alice.address)).pendingJoe).to.be.within(5130, 5180);
    //         expect(await this.rewarder.pendingTokens(this.alice.address)).to.equal(120);
    //         // Increase PartnerToken emission rate to 90 PartnerToken per block
    //         await this.rewarder.setRewardRate(90); // t+116, b=28
    //         // At b=35, Alice should have:
    //         //   - 5130 + 1*40*0.5 + 20*40*0.5 = 5550 (+50) SolarBeamToken
    //         //   - 120 + 1*40 + 5*90 = 610 PartnerToken
    //         await advanceTimeAndBlock(2); // t+118, b=29
    //         await advanceTimeAndBlock(3); // t+121, b=30
    //         await advanceTimeAndBlock(4); // t+125, b=31
    //         await advanceTimeAndBlock(5); // t+130, b=32
    //         await advanceTimeAndBlock(6); // t+136, b=33
    //         expect((await this.chef.pendingTokens(0, this.alice.address)).pendingJoe).to.be.within(5550, 5600);
    //         expect(await this.rewarder.pendingTokens(this.alice.address)).to.equal(610);
    //     });
    // });

    // context("With ERC/LP token added to the field and using MasterChefRewarderPerSec", function () {
    //     beforeEach(async function () {
    //         this.lp = await this.ERC20Mock.deploy("LPToken", "LP", "10000000000");
    //         await this.lp.transfer(this.alice.address, "1000");
    //         await this.lp.transfer(this.bob.address, "1000");
    //         await this.lp.transfer(this.carol.address, "1000");

    //         this.lp2 = await this.ERC20Mock.deploy("LPToken2", "LP2", "10000000000");
    //         await this.lp2.transfer(this.alice.address, "1000");
    //         await this.lp2.transfer(this.bob.address, "1000");
    //         await this.lp2.transfer(this.carol.address, "1000");

    //         this.dummyToken = await this.ERC20Mock.deploy("DummyToken", "DUMMY", "1");
    //         await this.dummyToken.transfer(this.partnerDev.address, "1");

    //         this.partnerChef = await this.MCV1PerSec.deploy(this.partnerToken.address, this.partnerDev.address, this.partnerRewardPerSec, this.partnerStartBlock, this.partnerBonusEndBlock);
    //         await this.partnerChef.deployed();
    //     });

    //     it("should check rewarder's arguments are contracts", async function () {
    //         await expect(this.MasterChefRewarderPerSec.deploy(ADDRESS_ZERO, this.lp.address, this.partnerRewardPerSec, this.partnerChefAllocPoint, this.partnerChefPid, this.partnerChef.address, this.chef.address)).to.be.revertedWith("constructor: reward token must be a valid contract");

    //         await expect(this.MasterChefRewarderPerSec.deploy(this.partnerToken.address, ADDRESS_ZERO, this.partnerRewardPerSec, this.partnerChefAllocPoint, this.partnerChefPid, this.partnerChef.address, this.chef.address)).to.be.revertedWith("constructor: LP token must be a valid contract");

    //         await expect(this.MasterChefRewarderPerSec.deploy(this.partnerToken.address, this.lp.address, this.partnerRewardPerSec, this.partnerChefAllocPoint, this.partnerChefPid, ADDRESS_ZERO, this.chef.address)).to.be.revertedWith("constructor: MasterChef must be a valid contract");

    //         await expect(this.MasterChefRewarderPerSec.deploy(this.partnerToken.address, this.lp.address, this.partnerRewardPerSec, this.partnerChefAllocPoint, this.partnerChefPid, this.partnerChef.address, ADDRESS_ZERO)).to.be.revertedWith("constructor: MasterChefJoeV2 must be a valid contract");
    //     });

    //     it("should check rewarder added and set properly", async function () {
    //         const startTime = (await latest()).add(60);
    //         this.chef = await this.MCV2.deploy(this.solar.address, this.dev.address, this.treasury.address, this.investor.address, this.solarPerSec, startTime, this.devPercent, this.treasuryPercent, this.investorPercent);
    //         await this.chef.deployed();

    //         this.rewarder = await this.MasterChefRewarderPerSec.deploy(this.partnerToken.address, this.lp.address, this.partnerRewardPerSec, this.partnerChefAllocPoint, this.partnerChefPid, this.partnerChef.address, this.chef.address);
    //         await this.rewarder.deployed();

    //         // Try to add rewarder that is neither zero address or contract address
    //         await expect(this.chef.add("100", this.lp.address, this.dev.address)).to.be.revertedWith("add: rewarder must be contract or zero");

    //         await this.chef.add("100", this.lp.address, this.rewarder.address);

    //         // Try to set rewarder that is neither zero address or contract address
    //         await expect(this.chef.set("0", "200", this.dev.address, true)).to.be.revertedWith("set: rewarder must be contract or zero");

    //         await this.chef.set("0", "200", this.rewarder.address, false);
    //         expect((await this.chef.poolInfo(0)).allocPoint).to.equal("200");

    //         // Alice has no DummyToken, so it should fail to init
    //         await expect(this.rewarder.connect(this.alice).init(this.dummyToken.address)).to.be.revertedWith("init: Balance must exceed 0");

    //         // Successfully init the rewarder
    //         await this.partnerChef.add(this.partnerChefAllocPoint, this.dummyToken.address, true);
    //         await this.dummyToken.connect(this.partnerDev).approve(this.rewarder.address, "1");
    //         await this.rewarder.connect(this.partnerDev).init(this.dummyToken.address);
    //         expect((await this.partnerChef.poolInfo(this.partnerChefPid)).lpToken).to.equal(this.dummyToken.address);
    //     });

    //     it("should allow a given pool's allocation weight and rewarder to be updated", async function () {
    //         const startTime = (await latest()).add(60);
    //         this.chef = await this.MCV2.deploy(this.solar.address, this.dev.address, this.treasury.address, this.investor.address, this.solarPerSec, startTime, this.devPercent, this.treasuryPercent, this.investorPercent);
    //         await this.chef.deployed();

    //         this.rewarder = await this.MasterChefRewarderPerSec.deploy(this.partnerToken.address, this.lp.address, this.partnerRewardPerSec, this.partnerChefAllocPoint, this.partnerChefPid, this.partnerChef.address, this.chef.address);
    //         await this.rewarder.deployed();

    //         await this.chef.add("100", this.lp.address, ADDRESS_ZERO);
    //         expect((await this.chef.poolInfo(0)).allocPoint).to.equal("100");
    //         expect((await this.chef.poolInfo(0)).rewarder).to.equal(ADDRESS_ZERO);

    //         await this.chef.set("0", "150", this.rewarder.address, true);
    //         expect((await this.chef.poolInfo(0)).allocPoint).to.equal("150");
    //         expect((await this.chef.poolInfo(0)).rewarder).to.equal(this.rewarder.address);
    //     });

    //     it("should only allow MasterChefJoeV2 to call onJoeReward", async function () {
    //         const startTime = (await latest()).add(60);
    //         this.chef = await this.MCV2.deploy(this.solar.address, this.dev.address, this.treasury.address, this.investor.address, this.solarPerSec, startTime, this.devPercent, this.treasuryPercent, this.investorPercent);
    //         await this.chef.deployed(); // t-59

    //         this.rewarder = await this.MasterChefRewarderPerSec.deploy(this.partnerToken.address, this.lp.address, this.partnerRewardPerSec, this.partnerChefAllocPoint, this.partnerChefPid, this.partnerChef.address, this.chef.address);
    //         await this.rewarder.deployed(); // t-58

    //         await this.partnerToken.transferOwnership(this.partnerChef.address); // t-57
    //         await this.partnerChef.add(this.partnerChefAllocPoint, this.dummyToken.address, true); // t-56

    //         await this.dummyToken.connect(this.partnerDev).approve(this.rewarder.address, "1"); // t-55
    //         await this.rewarder.connect(this.partnerDev).init(this.dummyToken.address); // t-54

    //         await this.solar.transferOwnership(this.chef.address); // t-53

    //         await this.chef.add("100", this.lp.address, this.rewarder.address); // t-52

    //         await this.lp.connect(this.bob).approve(this.chef.address, "1000"); // t-51
    //         await this.chef.connect(this.bob).deposit(0, "100"); // t-50
    //         await advanceTimeAndBlock(39); // t-11

    //         await expect(this.rewarder.onJoeReward(this.bob.address, "100")).to.be.revertedWith("onlyMCV2: only MasterChef V2 can call this function"); // t-10
    //         await this.chef.connect(this.bob).deposit(0, "0"); // t-9
    //         // Bob should have:
    //         //   - 0 SolarBeamToken
    //         //   - 41*40 = 1640 (+40) PartnerToken
    //         expect(await this.solar.balanceOf(this.bob.address)).to.equal("0");
    //         expect(await this.partnerToken.balanceOf(this.bob.address)).to.be.within(1640, 1680);
    //     });

    //     it("should allow rewarder to be set and removed mid farming", async function () {
    //         const startTime = (await latest()).add(60);
    //         this.chef = await this.MCV2.deploy(this.solar.address, this.dev.address, this.treasury.address, this.investor.address, this.solarPerSec, startTime, this.devPercent, this.treasuryPercent, this.investorPercent);
    //         await this.chef.deployed(); // t-59

    //         this.rewarder = await this.MasterChefRewarderPerSec.deploy(this.partnerToken.address, this.lp.address, this.partnerRewardPerSec, this.partnerChefAllocPoint, this.partnerChefPid, this.partnerChef.address, this.chef.address);
    //         await this.rewarder.deployed(); // t-58

    //         await this.partnerToken.transferOwnership(this.partnerChef.address); // t-57
    //         await this.partnerChef.add(this.partnerChefAllocPoint, this.dummyToken.address, true); // t-56

    //         await this.dummyToken.connect(this.partnerDev).approve(this.rewarder.address, "1"); // t-55
    //         await this.rewarder.connect(this.partnerDev).init(this.dummyToken.address); // t-54

    //         await this.solar.transferOwnership(this.chef.address); // t-53

    //         await this.chef.add("100", this.lp.address, ADDRESS_ZERO); // t-52

    //         await this.lp.connect(this.bob).approve(this.chef.address, "1000"); // t-51
    //         await this.chef.connect(this.bob).deposit(0, "100"); // t-50
    //         await advanceTimeAndBlock(39); // t-11

    //         await this.chef.connect(this.bob).deposit(0, "0"); // t-10
    //         expect(await this.solar.balanceOf(this.bob.address)).to.equal("0");
    //         // At t+10, Bob should have pending:
    //         //   - 10*50 = 500 (+50) SolarBeamToken
    //         //   - 0 PartnerToken
    //         await advanceTimeAndBlock(20); // t+10
    //         expect((await this.chef.pendingTokens(0, this.bob.address)).pendingJoe).to.be.within(500, 550);
    //         expect((await this.chef.pendingTokens(0, this.bob.address)).bonusTokenAddress).to.equal(ADDRESS_ZERO);
    //         expect((await this.chef.pendingTokens(0, this.bob.address)).pendingBonusToken).to.equal(0);

    //         // Pass rewarder but don't overwrite
    //         await this.chef.set(0, 100, this.rewarder.address, false); // t+11

    //         // At t+20, Bob should have pending:
    //         //   - 500 + 10*50 = 1000 (+50) SolarBeamToken
    //         //   - 0 PartnerToken
    //         await advanceTimeAndBlock(9); // t+20
    //         expect((await this.chef.pendingTokens(0, this.bob.address)).pendingJoe).to.be.within(1000, 1050);
    //         expect((await this.chef.pendingTokens(0, this.bob.address)).bonusTokenAddress).to.equal(ADDRESS_ZERO);
    //         expect((await this.chef.pendingTokens(0, this.bob.address)).pendingBonusToken).to.equal(0);

    //         // Pass rewarder and overwrite
    //         await this.chef.set(0, 100, this.rewarder.address, true); // t+21

    //         // At t+30, Bob should have pending:
    //         //   - 1000 + 10*50 = 1500 (+50) SolarBeamToken
    //         //   - 0 PartnerToken - this is because rewarder hasn't registered the user yet! User needs to call deposit again
    //         await advanceTimeAndBlock(9); // t+30
    //         expect((await this.chef.pendingTokens(0, this.bob.address)).pendingJoe).to.be.within(1500, 1550);
    //         expect((await this.chef.pendingTokens(0, this.bob.address)).bonusTokenAddress).to.equal(this.partnerToken.address);
    //         expect((await this.chef.pendingTokens(0, this.bob.address)).bonusTokenSymbol).to.equal("SUSHI");
    //         expect((await this.chef.pendingTokens(0, this.bob.address)).pendingBonusToken).to.equal(0);

    //         // Call deposit to start receiving PartnerTokens
    //         await this.chef.connect(this.bob).deposit(0, 0); // t+31

    //         // At t+40, Bob should have pending:
    //         //   - 9*50 = 450 (+50) SolarBeamToken
    //         //   - 9*40 = 360 (+40) PartnerToken
    //         await advanceTimeAndBlock(9); // t+40
    //         expect((await this.chef.pendingTokens(0, this.bob.address)).pendingJoe).to.be.within(450, 500);
    //         expect((await this.chef.pendingTokens(0, this.bob.address)).bonusTokenAddress).to.equal(this.partnerToken.address);
    //         expect((await this.chef.pendingTokens(0, this.bob.address)).bonusTokenSymbol).to.equal("SUSHI");
    //         expect((await this.chef.pendingTokens(0, this.bob.address)).pendingBonusToken).to.be.within(360, 400);

    //         // Set reward rate to zero
    //         await this.rewarder.setRewardRate(0); // t+41

    //         // At t+50, Bob should have pending:
    //         //   - 450 + 10*50 = 950 (+50) SolarBeamToken
    //         //   - 360 + 1*40 = 400 (+40) PartnerToken
    //         await advanceTimeAndBlock(4); // t+45
    //         await advanceTimeAndBlock(5); // t+50
    //         expect((await this.chef.pendingTokens(0, this.bob.address)).pendingJoe).to.be.within(950, 1000);
    //         expect((await this.chef.pendingTokens(0, this.bob.address)).bonusTokenAddress).to.equal(this.partnerToken.address);
    //         expect((await this.chef.pendingTokens(0, this.bob.address)).bonusTokenSymbol).to.equal("SUSHI");
    //         expect((await this.chef.pendingTokens(0, this.bob.address)).pendingBonusToken).to.be.within(400, 440);

    //         // Claim reward
    //         await this.chef.connect(this.bob).deposit(0, 0); // t+51

    //         // Bob should have:
    //         //   - 1500 + 1*50 + 950 + 1*50 = 2550 (+50) SolarBeamToken
    //         //   - 400 (+40) ParnterToken
    //         expect(await this.solar.balanceOf(this.bob.address)).to.be.within(2550, 2600);
    //         expect(await this.partnerToken.balanceOf(this.bob.address)).to.be.within(400, 440);
    //     });

    //     it("should allow allocation point to be set mid farming", async function () {
    //         const startTime = (await latest()).add(60);
    //         this.chef = await this.MCV2.deploy(this.solar.address, this.dev.address, this.treasury.address, this.investor.address, this.solarPerSec, startTime, this.devPercent, this.treasuryPercent, this.investorPercent);
    //         await this.chef.deployed(); // t-59

    //         this.rewarder = await this.MasterChefRewarderPerSec.deploy(this.partnerToken.address, this.lp.address, this.partnerRewardPerSec, this.partnerChefAllocPoint, this.partnerChefPid, this.partnerChef.address, this.chef.address);
    //         await this.rewarder.deployed(); // t-58

    //         await this.partnerToken.transferOwnership(this.partnerChef.address); // t-57
    //         await this.partnerChef.add(this.partnerChefAllocPoint, this.dummyToken.address, true); // t-56
    //         await this.partnerChef.add("200", this.lp2.address, true); // t-55

    //         await this.dummyToken.connect(this.partnerDev).approve(this.rewarder.address, "1"); // t-54
    //         await this.rewarder.connect(this.partnerDev).init(this.dummyToken.address); // t-53

    //         await this.solar.transferOwnership(this.chef.address); // t-52

    //         await this.chef.add("100", this.lp.address, this.rewarder.address); // t-51

    //         await this.lp.connect(this.bob).approve(this.chef.address, "1000"); // t-50
    //         await this.chef.connect(this.bob).deposit(0, "100"); // t-49
    //         await advanceTimeAndBlock(38); // t-11

    //         await this.chef.connect(this.bob).deposit(0, "0"); // t-10
    //         // Bob should have:
    //         //   - 0 SolarBeamToken
    //         //   - 37*40*1/3 = 493 (+60) PartnerToken
    //         expect(await this.solar.balanceOf(this.bob.address)).to.equal("0");
    //         expect(await this.partnerToken.balanceOf(this.bob.address)).to.be.within(493 - this.tokenOffset, 553 + this.tokenOffset);
    //         await advanceTimeAndBlock(8); // t-2

    //         await this.chef.connect(this.bob).deposit(0, "0"); // t-1
    //         expect(await this.solar.balanceOf(this.bob.address)).to.equal("0");
    //         await advanceTimeAndBlock(10); // t+9

    //         await this.chef.connect(this.bob).deposit(0, "0"); // t+10
    //         // Bob should have:
    //         //   - 10*50 = 500 (+50) SolarBeamToken
    //         //   - 493 + 20*40*1/3 = 760 (+60) PartnerToken
    //         expect(await this.solar.balanceOf(this.bob.address)).to.be.within(500, 550);
    //         expect(await this.partnerToken.balanceOf(this.bob.address)).to.be.within(760 - this.tokenOffset, 820 + this.tokenOffset);

    //         // Increase pool 1's alloc point
    //         //   For a brief amount of time, the rewarder is emitting 40/4 = 10 tokens per sec because the total allocPoint
    //         //   has increased to 400, but the pool alloc point on the rewarder has not been increased yet.
    //         await this.partnerChef.set(0, "200", true); // t+11
    //         await this.rewarder.updatePool(); // t+12
    //         await this.rewarder.setAllocPoint(200); // t+13

    //         await advanceTimeAndBlock(2); // t+15
    //         await advanceTimeAndBlock(5); // t+20
    //         await advanceTimeAndBlock(9); // t+29

    //         await this.chef.connect(this.bob).deposit(0, 0); // t+30

    //         // Bob should have:
    //         //   - 500 + 20*50 = 1500 (+50) SolarBeamToken
    //         //   - 760 + 3*40*1/4 + 17*40*1/2 = 1130 (+60) PartnerToken
    //         expect(await this.solar.balanceOf(this.bob.address)).to.be.within(1500, 1550);
    //         expect(await this.partnerToken.balanceOf(this.bob.address)).to.be.within(1130 - this.tokenOffset, 1190 + this.tokenOffset);
    //     });

    //     it("should give out JOEs only after farming time", async function () {
    //         const startTime = (await latest()).add(60);
    //         this.chef = await this.MCV2.deploy(this.solar.address, this.dev.address, this.treasury.address, this.investor.address, this.solarPerSec, startTime, this.devPercent, this.treasuryPercent, this.investorPercent);
    //         await this.chef.deployed(); // t-59

    //         this.rewarder = await this.MasterChefRewarderPerSec.deploy(this.partnerToken.address, this.lp.address, this.partnerRewardPerSec, this.partnerChefAllocPoint, this.partnerChefPid, this.partnerChef.address, this.chef.address);
    //         await this.rewarder.deployed(); // t-58

    //         await this.partnerToken.transferOwnership(this.partnerChef.address); // t-57
    //         await this.partnerChef.add(this.partnerChefAllocPoint, this.dummyToken.address, true); // t-56

    //         await this.dummyToken.connect(this.partnerDev).approve(this.rewarder.address, "1"); // t-55
    //         await this.rewarder.connect(this.partnerDev).init(this.dummyToken.address); // t-54

    //         await this.solar.transferOwnership(this.chef.address); // t-53

    //         await this.chef.add("100", this.lp.address, this.rewarder.address); // t-52

    //         await this.lp.connect(this.bob).approve(this.chef.address, "1000"); // t-51
    //         await this.chef.connect(this.bob).deposit(0, "100"); // t-50
    //         await advanceTimeAndBlock(39); // t-11

    //         await this.chef.connect(this.bob).deposit(0, "0"); // t-10
    //         // Bob should have:
    //         //   - 0 SolarBeamToken
    //         //   - 40*40 = 1600 (+40) PartnerToken
    //         expect(await this.solar.balanceOf(this.bob.address)).to.equal("0");
    //         expect(await this.partnerToken.balanceOf(this.bob.address)).to.be.within(1600, 1640);
    //         await advanceTimeAndBlock(8); // t-2

    //         await this.chef.connect(this.bob).deposit(0, "0"); // t-1
    //         expect(await this.solar.balanceOf(this.bob.address)).to.equal("0");
    //         await advanceTimeAndBlock(10); // t+9

    //         await this.chef.connect(this.bob).deposit(0, "0"); // t+10
    //         // Bob should have:
    //         //   - 10*50 = 500 (+50) SolarBeamToken
    //         //   - 1600 + 20*40 = 2400 (+40) PartnerToken
    //         expect(await this.solar.balanceOf(this.bob.address)).to.be.within(500, 550);
    //         expect(await this.partnerToken.balanceOf(this.bob.address)).to.be.within(2400, 2440);

    //         await advanceTimeAndBlock(4); // t+14, b=32
    //         await this.chef.connect(this.bob).deposit(0, "0"); // t+15, b=33

    //         // At this point:
    //         //   Bob should have:
    //         //     - 500 + 5*50 = 750 (+50) SolarBeamToken
    //         //     - 2400 + 5*40 = 2600 (+40) PartnerToken
    //         //   Dev should have: 15*20 = 300 (+20)
    //         //   Treasury should have: 15*20 = 300 (+20)
    //         //   Investor should have: 15*10 = 150 (+10)
    //         expect(await this.solar.balanceOf(this.bob.address)).to.be.within(750, 800);
    //         expect(await this.partnerToken.balanceOf(this.bob.address)).to.be.within(2600, 2640);
    //         expect(await this.solar.balanceOf(this.dev.address)).to.be.within(300, 320);
    //         expect(await this.solar.balanceOf(this.treasury.address)).to.be.within(300, 320);
    //         expect(await this.solar.balanceOf(this.investor.address)).to.be.within(150, 160);
    //         expect(await this.solar.totalSupply()).to.be.within(1500, 1600);
    //     });

    //     it("should not distribute JOEs if no one deposit", async function () {
    //         const startTime = (await latest()).add(60);
    //         this.chef = await this.MCV2.deploy(this.solar.address, this.dev.address, this.treasury.address, this.investor.address, this.solarPerSec, startTime, this.devPercent, this.treasuryPercent, this.investorPercent);
    //         await this.chef.deployed(); // t-59

    //         this.rewarder = await this.MasterChefRewarderPerSec.deploy(this.partnerToken.address, this.lp.address, this.partnerRewardPerSec, this.partnerChefAllocPoint, this.partnerChefPid, this.partnerChef.address, this.chef.address);
    //         await this.rewarder.deployed(); // t-58

    //         await this.partnerToken.transferOwnership(this.partnerChef.address); // t-57
    //         await this.partnerChef.add(this.partnerChefAllocPoint, this.dummyToken.address, true); // t-56

    //         await this.dummyToken.connect(this.partnerDev).approve(this.rewarder.address, "1"); // t-55
    //         await this.rewarder.connect(this.partnerDev).init(this.dummyToken.address); // t-54

    //         await this.solar.transferOwnership(this.chef.address); // t-53

    //         await this.chef.add("100", this.lp.address, this.rewarder.address); // t-52
    //         await this.lp.connect(this.bob).approve(this.chef.address, "1000"); // t-51
    //         await advanceTimeAndBlock(105); // t+54

    //         expect(await this.solar.totalSupply()).to.equal("0");
    //         expect(await this.partnerToken.balanceOf(this.bob.address)).to.equal("0");
    //         await advanceTimeAndBlock(5); // t+59
    //         expect(await this.solar.totalSupply()).to.equal("0");
    //         expect(await this.partnerToken.balanceOf(this.bob.address)).to.equal("0");
    //         await advanceTimeAndBlock(5); // t+64
    //         await this.chef.connect(this.bob).deposit(0, "10"); // t+65
    //         expect(await this.solar.totalSupply()).to.equal("0");
    //         expect(await this.solar.balanceOf(this.bob.address)).to.equal("0");
    //         expect(await this.partnerToken.balanceOf(this.bob.address)).to.equal("0");
    //         expect(await this.solar.balanceOf(this.dev.address)).to.equal("0");
    //         expect(await this.lp.balanceOf(this.bob.address)).to.equal("990");
    //         await advanceTimeAndBlock(10); // t+75
    //         // Revert if Bob withdraws more than he deposited
    //         await expect(this.chef.connect(this.bob).withdraw(0, "11")).to.be.revertedWith("withdraw: not good"); // t+76
    //         await this.chef.connect(this.bob).withdraw(0, "10"); // t+77

    //         // At this point:
    //         //   Bob should have:
    //         //     - 12*50 = 600 (+50) SolarBeamToken
    //         //     - 12*40 = 480 (+40) PartnerToken
    //         //  Dev should have:
    //         //     - 12*20 = 240 (+20) SolarBeamToken
    //         //  Treasury should have:
    //         //     - 12*20 = 240 (+20) SolarBeamToken
    //         //  Investor should have:
    //         //     - 12*10 = 120 (+10) SolarBeamToken
    //         expect(await this.solar.totalSupply()).to.be.within(1200, 1300);
    //         expect(await this.solar.balanceOf(this.bob.address)).to.be.within(600, 650);
    //         expect(await this.solar.balanceOf(this.dev.address)).to.be.within(240, 260);
    //         expect(await this.solar.balanceOf(this.treasury.address)).to.be.within(240, 260);
    //         expect(await this.solar.balanceOf(this.investor.address)).to.be.within(120, 130);
    //         expect(await this.partnerToken.balanceOf(this.bob.address)).to.be.within(480, 520);
    //     });

    //     it("should distribute JOEs properly for each staker", async function () {
    //         const startTime = (await latest()).add(60);
    //         this.chef = await this.MCV2.deploy(this.solar.address, this.dev.address, this.treasury.address, this.investor.address, this.solarPerSec, startTime, this.devPercent, this.treasuryPercent, this.investorPercent);
    //         await this.chef.deployed(); // t-59

    //         this.rewarder = await this.MasterChefRewarderPerSec.deploy(this.partnerToken.address, this.lp.address, this.partnerRewardPerSec, this.partnerChefAllocPoint, this.partnerChefPid, this.partnerChef.address, this.chef.address);
    //         await this.rewarder.deployed(); // t-58

    //         await this.partnerToken.transferOwnership(this.partnerChef.address); // t-57
    //         await this.partnerChef.add(this.partnerChefAllocPoint, this.dummyToken.address, true); // t-56

    //         await this.dummyToken.connect(this.partnerDev).approve(this.rewarder.address, "1"); // t-55
    //         await this.rewarder.connect(this.partnerDev).init(this.dummyToken.address); // t-54

    //         await this.solar.transferOwnership(this.chef.address); // t-53

    //         await this.chef.add("100", this.lp.address, this.rewarder.address); // t-52
    //         await this.lp.connect(this.alice).approve(this.chef.address, "1000", {
    //             from: this.alice.address,
    //         }); // t-50
    //         await this.lp.connect(this.bob).approve(this.chef.address, "1000", {
    //             from: this.bob.address,
    //         }); // t-49
    //         await this.lp.connect(this.carol).approve(this.chef.address, "1000", {
    //             from: this.carol.address,
    //         }); // t-48

    //         // Alice deposits 10 LPs at t+10
    //         await advanceTimeAndBlock(57); // t+9
    //         await this.chef.connect(this.alice).deposit(0, "10", { from: this.alice.address }); // t+10
    //         // Bob deposits 20 LPs at t+14
    //         await advanceTimeAndBlock(3); // t+13
    //         await this.chef.connect(this.bob).deposit(0, "20"); // t+14
    //         // Carol deposits 30 LPs at block t+18
    //         await advanceTimeAndBlock(3); // t+17
    //         await this.chef.connect(this.carol).deposit(0, "30", { from: this.carol.address }); // t+18
    //         // Alice deposits 10 more LPs at t+20. At this point:
    //         //   Alice should have:
    //         //      - 4*50 + 4*50*1/3 + 2*50*1/6 = 283 (+50) SolarBeamToken
    //         //      - 4*40 + 4*40*1/3 + 2*40*1/6 = 226 (+40) PartnerToken
    //         //   Dev should have: 10*20 = 200 (+20)
    //         //   Treasury should have: 10*20 = 200 (+20)
    //         //   Investor should have: 10*10 = 100 (+10)
    //         //   MasterChef should have: 1000 - 283 - 200 - 200 - 100 = 217 (+100)
    //         await advanceTimeAndBlock(1); // t+19
    //         await this.chef.connect(this.alice).deposit(0, "10", { from: this.alice.address }); // t+20,
    //         expect(await this.solar.totalSupply()).to.be.within(1000, 1100);
    //         // Because LP rewards are divided among participants and rounded down, we account
    //         // for rounding errors with an offset
    //         expect(await this.solar.balanceOf(this.alice.address)).to.be.within(283 - this.tokenOffset, 333 + this.tokenOffset);
    //         expect(await this.partnerToken.balanceOf(this.alice.address)).to.be.within(226 - this.tokenOffset, 266 + this.tokenOffset);

    //         expect(await this.solar.balanceOf(this.bob.address)).to.equal("0");
    //         expect(await this.partnerToken.balanceOf(this.bob.address)).to.equal("0");

    //         expect(await this.solar.balanceOf(this.carol.address)).to.equal("0");
    //         expect(await this.partnerToken.balanceOf(this.carol.address)).to.equal("0");

    //         expect(await this.solar.balanceOf(this.dev.address)).to.be.within(200 - this.tokenOffset, 220 + this.tokenOffset);
    //         expect(await this.solar.balanceOf(this.treasury.address)).to.be.within(200 - this.tokenOffset, 220 + this.tokenOffset);
    //         expect(await this.solar.balanceOf(this.investor.address)).to.be.within(100 - this.tokenOffset, 110 + this.tokenOffset);
    //         expect(await this.solar.balanceOf(this.chef.address)).to.be.within(217 - this.tokenOffset, 317 + this.tokenOffset);
    //         // Bob withdraws 5 LPs at t+30. At this point:
    //         //   Bob should have:
    //         //     - 4*50*2/3 + 2*50*2/6 + 10*50*2/7 = 309 (+50) SolarBeamToken
    //         //     - 4*40*2/3 + 2*40*2/6 + 10*40*2/7 = 247 (+40) PartnerToken
    //         //   Dev should have: 20*20= 400 (+20)
    //         //   Treasury should have: 20*20 = 400 (+20)
    //         //   Investor should have:  20*10 = 200 (+10)
    //         //   MasterChef should have: 217 + 1000 - 309 - 200 - 200 - 100 = 408 (+100)
    //         await advanceTimeAndBlock(9); // t+29
    //         await this.chef.connect(this.bob).withdraw(0, "5", { from: this.bob.address }); // t+30
    //         expect(await this.solar.totalSupply()).to.be.within(2000, 2100);
    //         // Because of rounding errors, we use token offsets
    //         expect(await this.solar.balanceOf(this.alice.address)).to.be.within(283 - this.tokenOffset, 333 + this.tokenOffset);
    //         expect(await this.partnerToken.balanceOf(this.alice.address)).to.be.within(226 - this.tokenOffset, 266 + this.tokenOffset);

    //         expect(await this.solar.balanceOf(this.bob.address)).to.be.within(309 - this.tokenOffset, 359 + this.tokenOffset);
    //         expect(await this.partnerToken.balanceOf(this.bob.address)).to.be.within(247 - this.tokenOffset, 287 + this.tokenOffset);

    //         expect(await this.solar.balanceOf(this.carol.address)).to.equal("0");
    //         expect(await this.partnerToken.balanceOf(this.carol.address)).to.equal("0");

    //         expect(await this.solar.balanceOf(this.dev.address)).to.be.within(400 - this.tokenOffset, 420 + this.tokenOffset);
    //         expect(await this.solar.balanceOf(this.treasury.address)).to.be.within(400 - this.tokenOffset, 420 + this.tokenOffset);
    //         expect(await this.solar.balanceOf(this.investor.address)).to.be.within(200 - this.tokenOffset, 210 + this.tokenOffset);
    //         expect(await this.solar.balanceOf(this.chef.address)).to.be.within(408 - this.tokenOffset, 508 + this.tokenOffset);
    //         // Alice withdraws 20 LPs at t+40
    //         // Bob withdraws 15 LPs at t+50
    //         // Carol withdraws 30 LPs at t+60
    //         await advanceTimeAndBlock(9); // t+39
    //         await this.chef.connect(this.alice).withdraw(0, "20", { from: this.alice.address }); // t+40
    //         await advanceTimeAndBlock(9); // t+49
    //         await this.chef.connect(this.bob).withdraw(0, "15", { from: this.bob.address }); // t+50
    //         await advanceTimeAndBlock(9); // t+59
    //         await this.chef.connect(this.carol).withdraw(0, "30", { from: this.carol.address }); // t+60
    //         expect(await this.solar.totalSupply()).to.be.within(5000, 5100);
    //         // Alice should have:
    //         //  - 283 + 10*50*2/7 + 10*50*20/65 = 579 (+50) SolarBeamToken
    //         //  - 226 + 10*40*2/7 + 10*40*20/65 = 463 (+40) PartnerToken
    //         expect(await this.solar.balanceOf(this.alice.address)).to.be.within(579 - this.tokenOffset, 629 + this.tokenOffset);
    //         expect(await this.partnerToken.balanceOf(this.alice.address)).to.be.within(463 - this.tokenOffset, 503 + this.tokenOffset);
    //         // Bob should have:
    //         //  - 309 + 10*50*15/65 + 10*50*15/45 = 591 (+50) SolarBeamToken
    //         //  - 247 + 10*40*15/65 + 10*40*15/45 = 472 (+40) PartnerToken
    //         expect(await this.solar.balanceOf(this.bob.address)).to.be.within(591 - this.tokenOffset, 641 + this.tokenOffset);
    //         expect(await this.partnerToken.balanceOf(this.bob.address)).to.be.within(472 - this.tokenOffset, 512 + this.tokenOffset);
    //         // Carol should have:
    //         //  - 2*50*3/6 + 10*50*3/7 + 10*50*30/65 + 10*50*30/45 + 10*50 = 1328 (+50) SolarBeamToken
    //         //  - 2*40*1/2 + 10*40*3/7 + 10*40*30/65 + 10*40*30/45 + 10*40 = 1062 (+40) PartnerToken
    //         expect(await this.solar.balanceOf(this.carol.address)).to.be.within(1328 - this.tokenOffset, 1378 + this.tokenOffset);
    //         expect(await this.partnerToken.balanceOf(this.carol.address)).to.be.within(1062 - this.tokenOffset, 1102 + this.tokenOffset);
    //         // Dev should have: 50*20 = 1000 (+20)
    //         // Treasury should have: 50*20 = 1000 (+20)
    //         // Investor should have: 50*10 = 500 (+10)
    //         expect(await this.solar.balanceOf(this.dev.address)).to.be.within(1000 - this.tokenOffset, 1020 + this.tokenOffset);
    //         expect(await this.solar.balanceOf(this.treasury.address)).to.be.within(1000 - this.tokenOffset, 1020 + this.tokenOffset);
    //         expect(await this.solar.balanceOf(this.investor.address)).to.be.within(500 - this.tokenOffset, 510 + this.tokenOffset);
    //         // MasterChefJoe and PartnerChef should have nothing
    //         expect(await this.solar.balanceOf(this.chef.address)).to.be.within(0, 0 + this.tokenOffset);
    //         expect(await this.partnerToken.balanceOf(this.partnerChef.address)).to.be.within(0, 0 + this.tokenOffset);

    //         // // All of them should have 1000 LPs back.
    //         expect(await this.lp.balanceOf(this.alice.address)).to.equal("1000");
    //         expect(await this.lp.balanceOf(this.bob.address)).to.equal("1000");
    //         expect(await this.lp.balanceOf(this.carol.address)).to.equal("1000");
    //     });

    //     it("should give proper JOEs allocation to each pool", async function () {
    //         const startTime = (await latest()).add(60);
    //         this.chef = await this.MCV2.deploy(this.solar.address, this.dev.address, this.treasury.address, this.investor.address, this.solarPerSec, startTime, this.devPercent, this.treasuryPercent, this.investorPercent);
    //         await this.chef.deployed(); // t-59

    //         this.rewarder = await this.MasterChefRewarderPerSec.deploy(this.partnerToken.address, this.lp.address, this.partnerRewardPerSec, this.partnerChefAllocPoint, this.partnerChefPid, this.partnerChef.address, this.chef.address);
    //         await this.rewarder.deployed(); // t-58

    //         await this.partnerToken.transferOwnership(this.partnerChef.address); // t-57
    //         await this.partnerChef.add(this.partnerChefAllocPoint, this.dummyToken.address, true); // t-56

    //         await this.dummyToken.connect(this.partnerDev).approve(this.rewarder.address, "1"); // t-55
    //         await this.rewarder.connect(this.partnerDev).init(this.dummyToken.address); // t-54

    //         await this.solar.transferOwnership(this.chef.address); // t-53

    //         await this.lp.connect(this.alice).approve(this.chef.address, "1000", { from: this.alice.address }); // t-52
    //         await this.lp2.connect(this.bob).approve(this.chef.address, "1000", { from: this.bob.address }); // t-51
    //         // Add first LP to the pool with allocation 10
    //         await this.chef.add("10", this.lp.address, this.rewarder.address); // t-50
    //         // Alice deposits 10 LPs at t+10
    //         await advanceTimeAndBlock(59); // t+9
    //         await this.chef.connect(this.alice).deposit(0, "10", { from: this.alice.address }); // t+10
    //         // Add LP2 to the pool with allocation 20 at t+20
    //         await advanceTimeAndBlock(9); // t+19
    //         await this.chef.add("20", this.lp2.address, ADDRESS_ZERO); // t+20
    //         // Alice's pending reward should be:
    //         //   - 10*50 = 500 (+50) SolarBeamToken
    //         //   - 10*40 = 400 (+40)  PartnerToken
    //         expect((await this.chef.pendingTokens(0, this.alice.address)).pendingJoe).to.be.within(500 - this.tokenOffset, 550 + this.tokenOffset);
    //         expect(await this.rewarder.pendingTokens(this.alice.address)).to.be.within(400, 440);
    //         // Bob deposits 10 LP2s at t+25
    //         await advanceTimeAndBlock(4); // t+24
    //         await this.chef.connect(this.bob).deposit(1, "10", { from: this.bob.address }); // t+25
    //         // Alice's pending reward should be:
    //         //   - 500 + 5*1/3*50 = 583 (+50) SolarBeamToken
    //         //   - 400 + 5*40 = 600 (+40) PartnerToken
    //         expect((await this.chef.pendingTokens(0, this.alice.address)).pendingJoe).to.be.within(583 - this.tokenOffset, 633 + this.tokenOffset);
    //         expect(await this.rewarder.pendingTokens(this.alice.address)).to.be.within(600, 640);

    //         // At this point:
    //         //   Alice's pending reward should be:
    //         //     - 583 + 5*1/3*50 = 666 (+50) SolarBeamToken
    //         //     - 600 + 5*40 = 800 (+40) PartnerToken
    //         // Bob's pending reward should be:
    //         //     - 5*2/3*50 = 166 (+50) SolarBeamToken
    //         //     - 0 PartnerToken
    //         await advanceTimeAndBlock(5); // t+30
    //         expect((await this.chef.pendingTokens(0, this.alice.address)).pendingJoe).to.be.within(666 - this.tokenOffset, 716 + this.tokenOffset);
    //         expect(await this.rewarder.pendingTokens(this.alice.address)).to.be.within(800, 840);

    //         expect((await this.chef.pendingTokens(1, this.bob.address)).pendingJoe).to.be.within(166 - this.tokenOffset, 216 + this.tokenOffset);
    //         expect(await this.rewarder.pendingTokens(this.bob.address)).to.equal(0);

    //         // Alice and Bob should not have pending rewards in pools they're not staked in
    //         expect((await this.chef.pendingTokens(1, this.alice.address)).pendingJoe).to.equal("0");
    //         expect((await this.chef.pendingTokens(0, this.bob.address)).pendingJoe).to.equal("0");

    //         // Make sure they have receive the same amount as what was pending
    //         await this.chef.connect(this.alice).withdraw(0, "10", { from: this.alice.address }); // t+31
    //         // Alice should have:
    //         //   - 666 + 1*1/3*50 = 682 (+50) SolarBeamToken
    //         //   - 800 + 1*40 = 840 (+40) PartnerToken
    //         expect(await this.solar.balanceOf(this.alice.address)).to.be.within(682 - this.tokenOffset, 732 + this.tokenOffset);
    //         expect(await this.partnerToken.balanceOf(this.alice.address)).to.be.within(840, 880);

    //         await this.chef.connect(this.bob).withdraw(1, "5", { from: this.bob.address }); // t+32
    //         // Bob should have:
    //         //   - 166 + 2*2/3*50 = 232 (+50) SolarBeamToken
    //         //   - 0 PartnerToken
    //         expect(await this.solar.balanceOf(this.bob.address)).to.be.within(232 - this.tokenOffset, 282 + this.tokenOffset);
    //         expect(await this.rewarder.pendingTokens(this.bob.address)).to.equal(0);
    //     });

    //     it("should give proper JOEs after updating emission rate", async function () {
    //         const startTime = (await latest()).add(60);
    //         this.chef = await this.MCV2.deploy(this.solar.address, this.dev.address, this.treasury.address, this.investor.address, this.solarPerSec, startTime, this.devPercent, this.treasuryPercent, this.investorPercent);
    //         await this.chef.deployed(); // t-59

    //         this.rewarder = await this.MasterChefRewarderPerSec.deploy(this.partnerToken.address, this.lp.address, this.partnerRewardPerSec, this.partnerChefAllocPoint, this.partnerChefPid, this.partnerChef.address, this.chef.address);
    //         await this.rewarder.deployed(); // t-58

    //         await this.partnerToken.transferOwnership(this.partnerChef.address); // t-57
    //         await this.partnerChef.add(this.partnerChefAllocPoint, this.dummyToken.address, true); // t-56

    //         await this.dummyToken.connect(this.partnerDev).approve(this.rewarder.address, "1"); // t-55
    //         await this.rewarder.connect(this.partnerDev).init(this.dummyToken.address); // t-54

    //         await this.solar.transferOwnership(this.chef.address); // t-53

    //         await this.lp.connect(this.alice).approve(this.chef.address, "1000", { from: this.alice.address }); // t-52
    //         await this.chef.add("10", this.lp.address, this.rewarder.address); // t-51
    //         // Alice deposits 10 LPs at t+10
    //         await advanceTimeAndBlock(60); // t+9
    //         await this.chef.connect(this.alice).deposit(0, "10", { from: this.alice.address }); // t+10
    //         // At t+110, Alice should have:
    //         //   - 100*100*0.5 = 5000 (+50) SolarBeamToken
    //         //   - 100*40 = 4000 (+40) PartnerToken
    //         await advanceTimeAndBlock(100); // t+110
    //         expect((await this.chef.pendingTokens(0, this.alice.address)).pendingJoe).to.be.within(5000, 5050);
    //         expect(await this.rewarder.pendingTokens(this.alice.address)).to.be.within(4000, 4040);
    //         // Lower JOE emission rate to 40 JOE per sec
    //         await this.chef.updateEmissionRate(40); // t+111
    //         // At t+115, Alice should have:
    //         //   - 5000 + 1*100*0.5 + 4*40*0.5 = 5130 (+50) SolarBeamToken
    //         //   - 4000 + 5*40 = 4200 (+40) PartnerToken
    //         await advanceTimeAndBlock(4); // t+115
    //         expect((await this.chef.pendingTokens(0, this.alice.address)).pendingJoe).to.be.within(5130, 5180);
    //         expect(await this.rewarder.pendingTokens(this.alice.address)).to.be.within(4200, 4240);
    //         // Increase PartnerToken emission rate to 90 PartnerToken per block
    //         await this.rewarder.setRewardRate(90); // t+116
    //         // At b=35, Alice should have:
    //         //   - 5130 + 21*40*0.5 = 5550 (+50) SolarBeamToken
    //         //   - 4200 + 1*40 + 20*90 = 6040 (+90) PartnerToken
    //         await advanceTimeAndBlock(20); // t+136
    //         expect((await this.chef.pendingTokens(0, this.alice.address)).pendingJoe).to.be.within(5550, 5600);
    //         expect(await this.rewarder.pendingTokens(this.alice.address)).to.be.within(6040, 6130);
    //     });
    // });
});
