
var { ethers } = require('ethers');
var BadgerBridgeZeroController = require('./artifacts/contracts/controllers/BadgerBridgeZeroController.sol/BadgerBridgeZeroController');

var provider = new ethers.providers.InfuraProvider('mainnet');


var wallet = new ethers.Wallet(process.env.WALLET, provider);
var factory = new ethers.ContractFactory(BadgerBridgeZeroController.abi, BadgerBridgeZeroController.bytecode, new ethers.Wallet(process.env.WALLET, provider));
