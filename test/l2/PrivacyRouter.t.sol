// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.7;

import "forge-std/Test.sol";
import {PrivacyRouter} from "../../contracts/l2/PrivacyRouter.sol";
import {IPrivacyRouter, PrivacyMode} from "../../contracts/shared/interfaces/IPrivacyRouter.sol";

contract PrivacyRouterTest is Test {
    PrivacyRouter public router;

    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address carol = makeAddr("carol");
    address tokenA = makeAddr("tokenA");
    address tokenB = makeAddr("tokenB");

    event ModeChanged(address indexed account, PrivacyMode mode);
    event RulesChanged(address indexed account, uint256 minAmount, address[] tokenWhitelist, address[] senderWhitelist);

    function setUp() public {
        router = new PrivacyRouter();
    }

    // ──────────────────────────────────────────────
    // Default state
    // ──────────────────────────────────────────────

    function test_defaultModeIsPublic() public view {
        assertEq(uint256(router.getMode(alice)), uint256(PrivacyMode.PUBLIC));
    }

    function test_defaultRulesAreEmpty() public view {
        (PrivacyMode mode, uint256 minAmount, address[] memory tokens, address[] memory senders) =
            router.getRules(alice);
        assertEq(uint256(mode), uint256(PrivacyMode.PUBLIC));
        assertEq(minAmount, 0);
        assertEq(tokens.length, 0);
        assertEq(senders.length, 0);
    }

    function test_shouldShield_publicByDefault() public view {
        assertFalse(router.shouldShield(alice, bob, 1 ether, address(0)));
    }

    // ──────────────────────────────────────────────
    // setMode
    // ──────────────────────────────────────────────

    function test_setMode_autoShield() public {
        vm.prank(alice);
        router.setMode(PrivacyMode.AUTO_SHIELD);
        assertEq(uint256(router.getMode(alice)), uint256(PrivacyMode.AUTO_SHIELD));
    }

    function test_setMode_custom() public {
        vm.prank(alice);
        router.setMode(PrivacyMode.CUSTOM);
        assertEq(uint256(router.getMode(alice)), uint256(PrivacyMode.CUSTOM));
    }

    function test_setMode_backToPublic() public {
        vm.prank(alice);
        router.setMode(PrivacyMode.AUTO_SHIELD);
        vm.prank(alice);
        router.setMode(PrivacyMode.PUBLIC);
        assertEq(uint256(router.getMode(alice)), uint256(PrivacyMode.PUBLIC));
    }

    function test_setMode_emitsEvent() public {
        vm.prank(alice);
        vm.expectEmit(true, false, false, true);
        emit ModeChanged(alice, PrivacyMode.AUTO_SHIELD);
        router.setMode(PrivacyMode.AUTO_SHIELD);
    }

    function test_setMode_onlyAffectsCaller() public {
        vm.prank(alice);
        router.setMode(PrivacyMode.AUTO_SHIELD);
        // Bob's mode should still be PUBLIC
        assertEq(uint256(router.getMode(bob)), uint256(PrivacyMode.PUBLIC));
    }

    // ──────────────────────────────────────────────
    // setRules
    // ──────────────────────────────────────────────

    function test_setRules_minAmount() public {
        vm.prank(alice);
        router.setRules(0.5 ether, new address[](0), new address[](0));

        (, uint256 minAmount,,) = router.getRules(alice);
        assertEq(minAmount, 0.5 ether);
    }

    function test_setRules_tokenWhitelist() public {
        address[] memory tokens = new address[](2);
        tokens[0] = tokenA;
        tokens[1] = tokenB;

        vm.prank(alice);
        router.setRules(0, tokens, new address[](0));

        (,, address[] memory returnedTokens,) = router.getRules(alice);
        assertEq(returnedTokens.length, 2);
        assertEq(returnedTokens[0], tokenA);
        assertEq(returnedTokens[1], tokenB);
    }

    function test_setRules_senderWhitelist() public {
        address[] memory senders = new address[](1);
        senders[0] = bob;

        vm.prank(alice);
        router.setRules(0, new address[](0), senders);

        (,,, address[] memory returnedSenders) = router.getRules(alice);
        assertEq(returnedSenders.length, 1);
        assertEq(returnedSenders[0], bob);
    }

    function test_setRules_emitsEvent() public {
        address[] memory tokens = new address[](1);
        tokens[0] = tokenA;
        address[] memory senders = new address[](1);
        senders[0] = bob;

        vm.prank(alice);
        vm.expectEmit(true, false, false, true);
        emit RulesChanged(alice, 1 ether, tokens, senders);
        router.setRules(1 ether, tokens, senders);
    }

    function test_setRules_overwritesPrevious() public {
        address[] memory tokens1 = new address[](2);
        tokens1[0] = tokenA;
        tokens1[1] = tokenB;

        vm.prank(alice);
        router.setRules(1 ether, tokens1, new address[](0));

        // Overwrite with different rules
        address[] memory tokens2 = new address[](1);
        tokens2[0] = tokenB;

        vm.prank(alice);
        router.setRules(2 ether, tokens2, new address[](0));

        (, uint256 minAmount, address[] memory returnedTokens,) = router.getRules(alice);
        assertEq(minAmount, 2 ether);
        assertEq(returnedTokens.length, 1);
        assertEq(returnedTokens[0], tokenB);
    }

    // ──────────────────────────────────────────────
    // shouldShield — AUTO_SHIELD mode
    // ──────────────────────────────────────────────

    function test_shouldShield_autoShield_basic() public {
        vm.prank(alice);
        router.setMode(PrivacyMode.AUTO_SHIELD);

        assertTrue(router.shouldShield(alice, bob, 1 ether, address(0)));
    }

    function test_shouldShield_autoShield_belowMinAmount() public {
        vm.prank(alice);
        router.setMode(PrivacyMode.AUTO_SHIELD);
        vm.prank(alice);
        router.setRules(1 ether, new address[](0), new address[](0));

        // 0.5 ETH < 1 ETH minimum → don't shield
        assertFalse(router.shouldShield(alice, bob, 0.5 ether, address(0)));
        // 1 ETH >= 1 ETH minimum → shield
        assertTrue(router.shouldShield(alice, bob, 1 ether, address(0)));
    }

    function test_shouldShield_autoShield_senderWhitelisted() public {
        vm.prank(alice);
        router.setMode(PrivacyMode.AUTO_SHIELD);

        address[] memory senders = new address[](1);
        senders[0] = bob;
        vm.prank(alice);
        router.setRules(0, new address[](0), senders);

        // Bob is whitelisted → don't shield transfers from Bob
        assertFalse(router.shouldShield(alice, bob, 1 ether, address(0)));
        // Carol is NOT whitelisted → shield
        assertTrue(router.shouldShield(alice, carol, 1 ether, address(0)));
    }

    function test_shouldShield_autoShield_tokenWhitelist() public {
        vm.prank(alice);
        router.setMode(PrivacyMode.AUTO_SHIELD);

        address[] memory tokens = new address[](1);
        tokens[0] = tokenA;
        vm.prank(alice);
        router.setRules(0, tokens, new address[](0));

        // tokenA is in whitelist → shield
        assertTrue(router.shouldShield(alice, bob, 1 ether, tokenA));
        // tokenB is NOT in whitelist → don't shield
        assertFalse(router.shouldShield(alice, bob, 1 ether, tokenB));
    }

    function test_shouldShield_autoShield_emptyTokenWhitelist_shieldsAll() public {
        vm.prank(alice);
        router.setMode(PrivacyMode.AUTO_SHIELD);
        // No token whitelist set → shield all tokens
        assertTrue(router.shouldShield(alice, bob, 1 ether, tokenA));
        assertTrue(router.shouldShield(alice, bob, 1 ether, tokenB));
        assertTrue(router.shouldShield(alice, bob, 1 ether, address(0)));
    }

    // ──────────────────────────────────────────────
    // shouldShield — CUSTOM mode
    // ──────────────────────────────────────────────

    function test_shouldShield_custom_combinedRules() public {
        vm.prank(alice);
        router.setMode(PrivacyMode.CUSTOM);

        address[] memory tokens = new address[](1);
        tokens[0] = tokenA;
        address[] memory senders = new address[](1);
        senders[0] = bob;

        vm.prank(alice);
        router.setRules(0.5 ether, tokens, senders);

        // Bob (whitelisted sender) → never shield
        assertFalse(router.shouldShield(alice, bob, 10 ether, tokenA));

        // Carol + tokenA + 1 ETH → shield (token in list, above min, sender not whitelisted)
        assertTrue(router.shouldShield(alice, carol, 1 ether, tokenA));

        // Carol + tokenB + 1 ETH → don't shield (token NOT in list)
        assertFalse(router.shouldShield(alice, carol, 1 ether, tokenB));

        // Carol + tokenA + 0.1 ETH → don't shield (below min)
        assertFalse(router.shouldShield(alice, carol, 0.1 ether, tokenA));
    }

    // ──────────────────────────────────────────────
    // Access control: only owner sets own rules
    // ──────────────────────────────────────────────

    function test_accessControl_cannotSetOtherMode() public {
        // Alice sets her own mode → OK
        vm.prank(alice);
        router.setMode(PrivacyMode.AUTO_SHIELD);
        assertEq(uint256(router.getMode(alice)), uint256(PrivacyMode.AUTO_SHIELD));

        // Bob calls setMode → only affects Bob, NOT Alice
        vm.prank(bob);
        router.setMode(PrivacyMode.PUBLIC);
        // Alice's mode unchanged
        assertEq(uint256(router.getMode(alice)), uint256(PrivacyMode.AUTO_SHIELD));
        assertEq(uint256(router.getMode(bob)), uint256(PrivacyMode.PUBLIC));
    }

    function test_accessControl_cannotSetOtherRules() public {
        vm.prank(alice);
        router.setRules(1 ether, new address[](0), new address[](0));

        // Bob's rules should still be default
        (, uint256 bobMin,,) = router.getRules(bob);
        assertEq(bobMin, 0);

        // Alice's rules should be set
        (, uint256 aliceMin,,) = router.getRules(alice);
        assertEq(aliceMin, 1 ether);
    }
}
