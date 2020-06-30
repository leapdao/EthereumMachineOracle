const fs = require("fs");
const {compileAndSave, compile} = require('@ethereum-waffle/compiler');

const tempPath = "temp";
const srcPath = "src";
const machineTemplatePath = "Machine.template.sol";

const waffleConfig = {
  "sourceDirectory": tempPath,
  "compilerVersion": "0.6.8",
}

const machinePath = process.env.MACHINE || machineTemplatePath;

const mapOverFileTree = (dirPath, fileFunc, dirFunc) => {
  return () => {
    try {
      fs.readdirSync(dirPath)
        .forEach(fileName => {
          const filePath = dirPath + '/' + fileName;
          if (fs.statSync(filePath).isFile())
            fileFunc(filePath);
          else
            mapOverFileTree(filePath, fileFunc, dirFunc)();
        });
      dirFunc(dirPath);
    } catch {
      return;
    }
  }
}

const rmDir = (dirPath) => {
  return mapOverFileTree(dirPath,
                         (filePath) =>  fs.unlinkSync(filePath),
                         (dirPath) => fs.rmdirSync(dirPath));
}

const copyDir = (srcDir, destDir) => {
  return mapOverFileTree(srcDir,
                         (filePath) => fs.copyFileSync(filePath, destDir + filePath.replace(srcPath, "")),
                         (destDir) => {});          
}

const createTemp = () => fs.mkdirSync(tempPath);
const removeTemp = rmDir(tempPath);
const copySrcToTemp = copyDir(srcPath, tempPath);
const fillTemplate = mapOverFileTree(tempPath,
                                     (filePath) => {
                                       const contents = fs.readFileSync(filePath, "utf8");
                                       const newContents = contents.replace(machineTemplatePath, machinePath);
                                       fs.writeFileSync(filePath, newContents, "utf8");
                                     },
                                     (dirPath) => {});


const main = async () => {
  removeTemp();
  createTemp();
  copySrcToTemp();
  fillTemplate();
  await compileAndSave(waffleConfig);
  removeTemp();
}
main();
