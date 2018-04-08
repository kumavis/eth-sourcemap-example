const Eth = require('ethjs')
const pify = require('pify')
const { generateTxSummary } = require('eth-tx-summary')
const CodeUtils = require('truffle-code-utils')
const SolidityUtils = require('truffle-solidity-utils')
const ethUtil = require('ethereumjs-util')
const compileContract = require('./compile')

const provider = new Eth.HttpProvider('http://localhost:8545/')
const eth = new Eth(provider)

start().catch(console.warn)

async function start() {

  const coinbase = await eth.coinbase()

  const result = compileContract()
  const target = {
    contract: result.output.contracts['test.sol'].main,
    // meta: result.output.sources['test.sol'],
    source: result.source,
  }

  const mainContract = await deploy(target, { from: coinbase, gas: 1000000 })

  try {
    let txHash = await mainContract.f2()
  } catch (err) {
    console.log('ganache errored because of a throw')
    const block = await eth.getBlockByNumber('latest', false)
    txHash = block.transactions[0]
  }
  console.log('txHash:', txHash)
  const receipt = await verifyTxConfirmed(txHash)
  const success = Boolean(Number(receipt.status))
  console.log('success?', success)
  if (success) return

  const summary = await pify(generateTxSummary)(provider, txHash)
  // console.log(summary)

  const steps = summary
    .filter(({ type }) => type === 'step')
    .map(({ data }) => data)

  // steps.forEach((step, index) => {
  //   var stepNumber = index+1
  //   console.log(`[${stepNumber}] ${step.pc}: ${step.opcode.name}`)
  // })

  const revertStep = steps.find(({ opcode }) => opcode.name === 'REVERT')
  if (!revertStep) throw new Error('could not find revert step')

  const address = ethUtil.bufferToHex(revertStep.address)
  const codeBuffer = await eth.getCode(address)
  const codeHex = ethUtil.bufferToHex(codeBuffer)
  const instructions = CodeUtils.parseCode(codeHex)
  if (!instructions.length) throw new Error('could not parse code')
  // console.log(target.source)
  // console.log(instructions, instructions.length)
  // console.log('find', revertStep.pc, typeof revertStep.pc)
  // instructions.forEach(inst => console.log(inst))

  const revertInstructionIndex = instructions.findIndex(inst => inst.pc === revertStep.pc)
  if (revertInstructionIndex === -1) throw new Error('could not find revert instruction')
  const revertInstruction = instructions[revertInstructionIndex]

  // assuming revertStep.address = target
  const sourceMap = target.contract.evm.deployedBytecode.sourceMap
  const humanReadableSourceMap = SolidityUtils.getHumanReadableSourceMap(sourceMap)
  const sourceMapInstruction = humanReadableSourceMap[revertInstructionIndex]
  sourceMapInstruction
  // sourceMapInstruction.file is the index of the file
  // TODO use this to select the correct file
  const lineAndColumnMapping = SolidityUtils.getCharacterOffsetToLineAndColumnMapping(target.source)
  const range = {
    start: lineAndColumnMapping[sourceMapInstruction.start],
    end: lineAndColumnMapping[sourceMapInstruction.start + sourceMapInstruction.length]
  }

  console.log(range)
  const matchingLines = target.source.split('\n').slice(range.start.line, range.end.line + 1)
  matchingLines[0] = matchingLines[0].slice(range.start.column)
  matchingLines[matchingLines.length-1] = matchingLines[matchingLines.length-1].slice(0, range.end.column)
  const matchingSource = matchingLines.join('\n')
  console.log('REVERT occurred here:')
  console.log('```')
  console.log(matchingSource)
  console.log('```')

  // for more detailed inspection (downloaded from @gnidan's brain):
  // - track all variable declarations to later track memory/stack locations:
  //  https://github.com/trufflesuite/truffle-debugger/blob/develop/lib/data/sagas/index.js
  // - decoding memory to variable types:
  // https://github.com/trufflesuite/truffle-debugger/blob/develop/lib/data/decode/index.js
  // - search ast for matching instruction, to get sub-expressions:
  // https://github.com/trufflesuite/truffle-debugger/blob/develop/lib/ast/map.js

  // can use truffle-debugger as a library
  // http://truffleframework.com/truffle-debugger/
  // https://github.com/trufflesuite/truffle-debugger/blob/develop/lib/debugger.js#L45
  // https://github.com/trufflesuite/truffle-debugger/blob/develop/lib/debugger.js#L118


  // revertStep.
  // index: stepIndex,
  // pc: step.pc,
  // gasLeft: step.gasLeft,
  // opcode: step.opcode,
  // stack: step.stack,
  // depth: step.depth,
  // address: step.address,
  // account: step.account,
  // cache: step.cache,
  // memory: step.memory,

}

async function deploy(target, txParams) {
  const abi = target.contract.abi
  const deployCode = target.contract.evm.bytecode.object
  const MainContract = eth.contract(abi, deployCode, txParams)

  // work around for broken promise return
  const txHash = await pify(MainContract.new)()
  console.log('deploy contract', txHash)

  const receipt = await verifyTxConfirmed(txHash)
  console.log(`contract published in ${receipt.blockNumber} at ${receipt.contractAddress}`)
  const blockNumber = receipt.blockNumber.toNumber()

  const mainContract = MainContract.at(receipt.contractAddress)

  return mainContract
}

async function getDeployedContractAddress(txHash){
  const receipt = await verifyTxConfirmed(txHash)
  return receipt.contractAddress
}

async function verifyTxConfirmed(txHash) {
  const receipt = await pollUntilTruthy(async () => {
    const receipt = await eth.getTransactionReceipt(txHash)
    if (receipt.blockHash) return receipt
  })
  return receipt
}

function pollUntilTruthy(asyncFn){
  return new Promise(async (resolve, reject) => {
    try {
      while (true) {
        const result = await asyncFn()
        if (result) return resolve(result)
        await timeout(200)
      }
    } catch (err) {
      reject(err)
    }
  })
}

function timeout(duration){
  return new Promise((resolve) => setTimeout(resolve), duration)
}
