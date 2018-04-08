const compiler = require('solc')
const compilerInput = require('remix-lib/src/helpers/compilerHelper').compilerInput
const SourceMappingDecoder = require('remix-lib/src/sourceMappingDecoder')

const sourceMappingDecoder = new SourceMappingDecoder()

module.exports = compileContract


function compileContract(){

	const source = `
	pragma solidity ^0.4.21;

	contract main {
	    function f1(uint secretNumber) returns (bool) {
					require(secretNumber > 4);
					require(secretNumber % 2 == 1);
	        return true;
	    }

	    function f2() {
				f1(16);
	    }
	}
	`

	// Setting 1 as second paramateractivates the optimiser
	const rawOutput = compiler.compileStandardWrapper(compilerInput(source))
	const output = JSON.parse(rawOutput)


	// for (let contractName in output.contracts) {
	// 	// code and ABI that are needed by web3
	// 	const contract = output.contracts[contractName]
	// 	console.log(contractName)
	// 	console.log(JSON.stringify(contract, null, 2))
	// 	console.log('\n')
	// }


	return { source, output }

}
// console.log(JSON.stringify(target, null, 2))

// const astNodeType = 'FunctionDefinition'
// const instIndex = 2
// const sourceMap = target.contracts['main'].evm.deployedBytecode.sourceMap
// const ast = target.source
//
// const node = sourceMappingDecoder.findNodeAtInstructionIndex('FunctionDefinition', 80, sourceMap, target.source)
// console.log(JSON.stringify(node, null, 2))
