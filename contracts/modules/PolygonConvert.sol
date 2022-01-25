pragma solidity >=0.6.0;
import { PolygonConvertLib } from './PolygonConvertLib.sol';
import {SafeMath} from 'oz410/math/SafeMath.sol';
import {IERC20} from 'oz410/token/ERC20/IERC20.sol';
import {SafeERC20} from 'oz410/token/ERC20/SafeERC20.sol';
import {IController} from '../interfaces/IController.sol';
import {ICurveInt256} from '../interfaces/CurvePools/ICurveInt256.sol';
import {IRenCrvPolygon} from '../interfaces/CurvePools/IRenCrvPolygon.sol';


contract PolygonConvert {
    using SafeERC20 for *;
    using SafeMath for *;
    mapping(uint256 => PolygonConvertLib.ConvertRecord) public outstanding;
    address public immutable controller;
    address public immutable governance;
    uint256 public blockTimeout;
    address public constant weth = 0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619;
    address public constant wbtc = 0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6;
    address public constant want = 0xDBf31dF14B66535aF65AaC99C32e9eA844e14501;
    address public constant renCrvPolygon = 0xC2d95EEF97Ec6C17551d45e77B590dc1F9117C67;
    address public constant tricryptoPolygon = 0x92215849c439E1f8612b6646060B4E3E5ef822cC;

    modifier onlyController() {
        require(msg.sender == controller, '!controller');
        _;
    }

    constructor(address _controller) {
        controller = _controller;
        governance = IController(_controller).governance();
        IERC20(want).safeApprove(renCrvPolygon, ~uint256(0) >> 2);
        IERC20(wbtc).safeApprove(tricryptoPolygon, ~uint256(0) >> 2);
    }

    function setBlockTimeout(uint256 _ct) public {
        require(msg.sender == governance, '!governance');
        blockTimeout = _ct;
    }

    function isActive(PolygonConvertLib.ConvertRecord storage record) internal view returns (bool) {
        return record.qty != 0 || record.qtyETH != 0;
    }

    function defaultLoan(uint256 _nonce) public {
        require(block.number >= outstanding[_nonce].when + blockTimeout);
        require(isActive(outstanding[_nonce]), '!outstanding');
        uint256 _amountSwappedBack = swapTokensBack(outstanding[_nonce]);
        IERC20(want).safeTransfer(controller, _amountSwappedBack);
        delete outstanding[_nonce];
    }

    function receiveLoan(
        address _to,
        address _asset,
        uint256 _actual,
        uint256 _nonce,
        bytes memory _data
    ) public onlyController {
        uint256 ratio = abi.decode(_data, (uint256));
        (uint256 amountSwappedETH, uint256 amountSwappedBTC) = swapTokens(_actual, ratio);
        outstanding[_nonce] = PolygonConvertLib.ConvertRecord({
            qty: amountSwappedBTC,
            when: uint64(block.timestamp), 
            qtyETH: amountSwappedETH
        });
    }

    function swapTokens(uint256 _amountIn, uint256 _ratio)
        internal
        returns (uint256 amountSwappedETH, uint256 amountSwappedBTC)
    {
        uint256 amountToETH = _ratio.mul(_amountIn).div(uint256(1 ether));
        uint256 wbtcOut = amountToETH != 0 
            ? IRenCrvPolygon(renCrvPolygon).exchange(1, 0, amountToETH, 0)
			: 0;
		if (wbtcOut != 0) {
			uint256 _amountStart = address(this).balance;
			(bool success, ) = tricryptoPolygon.call(
				abi.encodeWithSelector(ICurveInt256.exchange.selector, 1, 2, wbtcOut, 0)
			);
			require(success, '!exchange');
			amountSwappedETH = address(this).balance.sub(_amountStart);
			amountSwappedBTC = _amountIn.sub(amountToETH);
		} else {
			amountSwappedBTC = _amountIn;
		}
    }

    receive() external payable {
		//
    }

    function swapTokensBack(PolygonConvertLib.ConvertRecord storage record) internal returns (uint256 amountReturned) {
        uint256 _amountStart = IERC20(wbtc).balanceOf(address(this));
        (bool success, ) = tricryptoPolygon.call{value: record.qtyETH}(
            abi.encodeWithSelector(ICurveInt256.exchange.selector, 2, 1, record.qtyETH, 0)
        );
        require(success, '!exchange');
        uint256 wbtcOut = IERC20(wbtc).balanceOf(address(this));
        amountReturned = IRenCrvPolygon(renCrvPolygon).exchange(0, 1, wbtcOut, 0).add(record.qty);
    }

    function repayLoan(
		address _to,
		address _asset,
		uint256 _actualAmount,
		uint256 _nonce,
		bytes memory _data
	) public onlyController {
		require(outstanding[_nonce].qty != 0 || outstanding[_nonce].qtyETH != 0, '!outstanding');
		IERC20(want).safeTransfer(_to, outstanding[_nonce].qty);
		address payable to = address(uint160(_to));
		to.transfer(outstanding[_nonce].qtyETH);
		delete outstanding[_nonce];
	}

    function computeReserveRequirement(uint256 _in) external view returns (uint256) {
		return _in.mul(uint256(1e17)).div(uint256(1 ether));
	}


}