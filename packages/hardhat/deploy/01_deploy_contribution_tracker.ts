import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async ({ deployments, getNamedAccounts }: HardhatRuntimeEnvironment) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  await deploy("ContributionTracker", {
    from: deployer,
    log: true,
    args: [],
    autoMine: true,
  });
};

export default func;
func.tags = ["ContributionTracker"];
