const fs = require("fs");
const {compileAndSave, compile} = require('@ethereum-waffle/compiler');

const tempPath = "temp";
const srcPath = "src";
const machineTemplatePath = "Machine.template.sol";

const waffleConfig = {
  "sourceDirectory": tempPath,
  "compilerVersion": "0.6.8",
}

const machinePath = process.argv[2] || machineTemplatePath;

const rmDir = (dirPath) => {
  try {
    fs.readdirSync(dirPath)
      .map(name => dirPath + '/' + name)
      .forEach(filePath => {
        if (fs.statSync(filePath).isFile())
          fs.unlinkSync(filePath);
        else
          rmDir(filePath);
      });
    fs.rmdirSync(dirPath);
  } catch {
    return;
  }
}

const copyDir = (srcDir, destDir) => {
  fs.readdirSync(srcDir)
    .forEach(fileName => {
      const srcPath = srcDir + '/' + fileName;
      const destPath = destDir + '/' + fileName;
      if (fs.statSync(srcPath).isFile())
        fs.copyFileSync(srcPath, destPath);
      else
        copyDir(srcPath, destPath);
    });
}

const createTemp = () => fs.mkdirSync(tempPath);
const removeTemp = () => rmDir(tempPath);
const copySrcToTemp = () => copyDir(srcPath, tempPath);
const fillTemplate = () => {
  fs.readdirSync(tempPath)
    .map(name => tempPath + '/' + name)
    .forEach(filePath => {
      const contents = fs.readFileSync(filePath, "utf8");
      const newContents = contents.replace(machineTemplatePath, machinePath);
      fs.writeFileSync(filePath, newContents, "utf8");
    })
}

const main = async () => {
  removeTemp();
  createTemp();
  copySrcToTemp();
  fillTemplate();
  await compileAndSave(waffleConfig);
  removeTemp();
}
main();
