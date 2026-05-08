// SPDX-License-Identifier: GPL-3.0
/*
    Copyright 2021 0KIMS association.

    This file is generated with [snarkJS](https://github.com/iden3/snarkjs).

    snarkJS is a free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    snarkJS is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
    or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public
    License for more details.

    You should have received a copy of the GNU General Public License
    along with snarkJS. If not, see <https://www.gnu.org/licenses/>.
*/

pragma solidity >=0.7.0 <0.9.0;

contract Groth16VerifierV5_5Stub {
    // Scalar field size
    uint256 constant r    = 21888242871839275222246405745257275088548364400416034343698204186575808495617;
    // Base field size
    uint256 constant q   = 21888242871839275222246405745257275088696311157297823662689037894645226208583;

    // Verification Key data
    uint256 constant alphax  = 20491192805390485299153009773594534940189261866228447918068658471970481763042;
    uint256 constant alphay  = 9383485363053290200918347156157836566562967994039712273449902621266178545958;
    uint256 constant betax1  = 4252822878758300859123897981450591353533073413197771768651442665752259397132;
    uint256 constant betax2  = 6375614351688725206403948262868962793625744043794305715222011528459656738731;
    uint256 constant betay1  = 21847035105528745403288232691147584728191162732299865338377159692350059136679;
    uint256 constant betay2  = 10505242626370262277552901082094356697409835680220590971873171140371331206856;
    uint256 constant gammax1 = 11559732032986387107991004021392285783925812861821192530917403151452391805634;
    uint256 constant gammax2 = 10857046999023057135944570762232829481370756359578518086990519993285655852781;
    uint256 constant gammay1 = 4082367875863433681332203403145435568316851327593401208105741076214120093531;
    uint256 constant gammay2 = 8495653923123431417604973247489272438418190587263600148770280649306958101930;
    uint256 constant deltax1 = 10045352840978387573652984602862303131836966997700656775778587499525721321467;
    uint256 constant deltax2 = 7902807646103198978107266100748313041971299006327878142221782734132222286890;
    uint256 constant deltay1 = 1020736889863476965112973512942340913123816538580373748578144249026477684222;
    uint256 constant deltay2 = 2898389003564460720120704399000933359970383966028095712721669893275755476790;

    
    uint256 constant IC0x = 5151276196119241991123008076947152872183705566333470411371643763031791951603;
    uint256 constant IC0y = 6222678857749070615542176363629568478314989302679258461569648641655887558591;
    
    uint256 constant IC1x = 5397354462463576045269108516749472220235092461498623269055817212346777169547;
    uint256 constant IC1y = 1354614097371853691354370114111057645262205214616873169690793377230906239600;
    
    uint256 constant IC2x = 7454747721240163302016389562432641010006229161223129325329996734151184912316;
    uint256 constant IC2y = 18230009458238652830239848574586734789929252067074609403042791695122460286672;
    
    uint256 constant IC3x = 2084400549391890074908824972616510280904649403942467034087732943365682532708;
    uint256 constant IC3y = 172024620337968458713858747697420883529154140788951446368993276776896759776;
    
    uint256 constant IC4x = 8484646756545472246818625117112480580165036855943432339864150360940576003648;
    uint256 constant IC4y = 2216643575476632986986986389479986182808314917291169507022072162109194786704;
    
    uint256 constant IC5x = 19130763207611169124317272616808335124844235142251863316274466217813000853857;
    uint256 constant IC5y = 15271338359364780382958807345773323833002954238416749393748868019029252271447;
    
    uint256 constant IC6x = 4356200368155458413699661926795665739066901759217038284317752654349898185056;
    uint256 constant IC6y = 17347835050172544950766104771165718129381824570737085365403515719630303393257;
    
    uint256 constant IC7x = 13797597251047507234949660723358477948817470178446790559176373926726514103362;
    uint256 constant IC7y = 20647051612870024918327819026620574949625058565327443747674459041204012076624;
    
    uint256 constant IC8x = 12604729138114736416971328128130128259713963339298134569324723335551144814584;
    uint256 constant IC8y = 16367934401781186271749051486770163807506696128902636285730540331624079977384;
    
    uint256 constant IC9x = 3500548076396567479134917980082542229411983805506306606484849853294763061588;
    uint256 constant IC9y = 19862243230838837088634535909491614506238832964803308965728405717562357638856;
    
    uint256 constant IC10x = 18939975697717637327527761663060611210875287030481172736775643040241709766658;
    uint256 constant IC10y = 17006484776252561081569051026522176094985888225080268146887349544335722214594;
    
    uint256 constant IC11x = 18568223131852643549092892029910356625500281287618781566174684804074815981674;
    uint256 constant IC11y = 5102230866011465922569535524264637085273474051542693506518524497783839987242;
    
    uint256 constant IC12x = 10668548113433510857502899849734468886192650021471582018983974099767184887736;
    uint256 constant IC12y = 2036145290806191721532083706921002753896716612683029608464576748884249213335;
    
    uint256 constant IC13x = 11233159912561967295535942773662123318029295620681740934646408712272373423495;
    uint256 constant IC13y = 9348372147598704182373686711864711356506721433833230883099056939854104378491;
    
    uint256 constant IC14x = 751506690019501419879333767637674967255202759711468488858212003136602616744;
    uint256 constant IC14y = 11235828522085935715961307912534068647882351798466696481134048073011053671912;
    
    uint256 constant IC15x = 10929388407408004027085133605267970390258652848810825934999624159747508913689;
    uint256 constant IC15y = 13618259448003240175302495394454522512401198617410719429402057593363200104515;
    
    uint256 constant IC16x = 7366342536903870509758073514744476167762545835090617839957698189236018440810;
    uint256 constant IC16y = 33674489231523109145267443748265871746228104857833203843383451188265624129;
    
    uint256 constant IC17x = 6286887362173600780155562220348735478724266936498397771737029922025740972266;
    uint256 constant IC17y = 1477910970109414471923173447557468037753094807197661114943950486033272427235;
    
    uint256 constant IC18x = 3586374804493256307075482261289358113932496541450229105596013548782343612144;
    uint256 constant IC18y = 2065252471261208036035820465841163526260845578060256264243666433388749456135;
    
    uint256 constant IC19x = 2828386653341672593760499689934055996344204480673649925943558200694129646306;
    uint256 constant IC19y = 14719506699578376997177957205159812244161974077240429718234866580864340737071;
    
    uint256 constant IC20x = 11572451569642642096600348535074138875586898014814130791828900289395624342349;
    uint256 constant IC20y = 12729516486273173428058613867760690438837934320735162315824729207322395814793;
    
    uint256 constant IC21x = 4665711041429295292842672513539935085834010725010773129500899796890168776868;
    uint256 constant IC21y = 1362339074418105935282716604700507041740608549133741974074309583224982598547;
    
 
    // Memory data
    uint16 constant pVk = 0;
    uint16 constant pPairing = 128;

    uint16 constant pLastMem = 896;

    function verifyProof(uint[2] calldata _pA, uint[2][2] calldata _pB, uint[2] calldata _pC, uint[21] calldata _pubSignals) public view returns (bool) {
        assembly {
            function checkField(v) {
                if iszero(lt(v, r)) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }
            
            // G1 function to multiply a G1 value(x,y) to value in an address
            function g1_mulAccC(pR, x, y, s) {
                let success
                let mIn := mload(0x40)
                mstore(mIn, x)
                mstore(add(mIn, 32), y)
                mstore(add(mIn, 64), s)

                success := staticcall(sub(gas(), 2000), 7, mIn, 96, mIn, 64)

                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }

                mstore(add(mIn, 64), mload(pR))
                mstore(add(mIn, 96), mload(add(pR, 32)))

                success := staticcall(sub(gas(), 2000), 6, mIn, 128, pR, 64)

                if iszero(success) {
                    mstore(0, 0)
                    return(0, 0x20)
                }
            }

            function checkPairing(pA, pB, pC, pubSignals, pMem) -> isOk {
                let _pPairing := add(pMem, pPairing)
                let _pVk := add(pMem, pVk)

                mstore(_pVk, IC0x)
                mstore(add(_pVk, 32), IC0y)

                // Compute the linear combination vk_x
                
                g1_mulAccC(_pVk, IC1x, IC1y, calldataload(add(pubSignals, 0)))
                
                g1_mulAccC(_pVk, IC2x, IC2y, calldataload(add(pubSignals, 32)))
                
                g1_mulAccC(_pVk, IC3x, IC3y, calldataload(add(pubSignals, 64)))
                
                g1_mulAccC(_pVk, IC4x, IC4y, calldataload(add(pubSignals, 96)))
                
                g1_mulAccC(_pVk, IC5x, IC5y, calldataload(add(pubSignals, 128)))
                
                g1_mulAccC(_pVk, IC6x, IC6y, calldataload(add(pubSignals, 160)))
                
                g1_mulAccC(_pVk, IC7x, IC7y, calldataload(add(pubSignals, 192)))
                
                g1_mulAccC(_pVk, IC8x, IC8y, calldataload(add(pubSignals, 224)))
                
                g1_mulAccC(_pVk, IC9x, IC9y, calldataload(add(pubSignals, 256)))
                
                g1_mulAccC(_pVk, IC10x, IC10y, calldataload(add(pubSignals, 288)))
                
                g1_mulAccC(_pVk, IC11x, IC11y, calldataload(add(pubSignals, 320)))
                
                g1_mulAccC(_pVk, IC12x, IC12y, calldataload(add(pubSignals, 352)))
                
                g1_mulAccC(_pVk, IC13x, IC13y, calldataload(add(pubSignals, 384)))
                
                g1_mulAccC(_pVk, IC14x, IC14y, calldataload(add(pubSignals, 416)))
                
                g1_mulAccC(_pVk, IC15x, IC15y, calldataload(add(pubSignals, 448)))
                
                g1_mulAccC(_pVk, IC16x, IC16y, calldataload(add(pubSignals, 480)))
                
                g1_mulAccC(_pVk, IC17x, IC17y, calldataload(add(pubSignals, 512)))
                
                g1_mulAccC(_pVk, IC18x, IC18y, calldataload(add(pubSignals, 544)))
                
                g1_mulAccC(_pVk, IC19x, IC19y, calldataload(add(pubSignals, 576)))
                
                g1_mulAccC(_pVk, IC20x, IC20y, calldataload(add(pubSignals, 608)))
                
                g1_mulAccC(_pVk, IC21x, IC21y, calldataload(add(pubSignals, 640)))
                

                // -A
                mstore(_pPairing, calldataload(pA))
                mstore(add(_pPairing, 32), mod(sub(q, calldataload(add(pA, 32))), q))

                // B
                mstore(add(_pPairing, 64), calldataload(pB))
                mstore(add(_pPairing, 96), calldataload(add(pB, 32)))
                mstore(add(_pPairing, 128), calldataload(add(pB, 64)))
                mstore(add(_pPairing, 160), calldataload(add(pB, 96)))

                // alpha1
                mstore(add(_pPairing, 192), alphax)
                mstore(add(_pPairing, 224), alphay)

                // beta2
                mstore(add(_pPairing, 256), betax1)
                mstore(add(_pPairing, 288), betax2)
                mstore(add(_pPairing, 320), betay1)
                mstore(add(_pPairing, 352), betay2)

                // vk_x
                mstore(add(_pPairing, 384), mload(add(pMem, pVk)))
                mstore(add(_pPairing, 416), mload(add(pMem, add(pVk, 32))))


                // gamma2
                mstore(add(_pPairing, 448), gammax1)
                mstore(add(_pPairing, 480), gammax2)
                mstore(add(_pPairing, 512), gammay1)
                mstore(add(_pPairing, 544), gammay2)

                // C
                mstore(add(_pPairing, 576), calldataload(pC))
                mstore(add(_pPairing, 608), calldataload(add(pC, 32)))

                // delta2
                mstore(add(_pPairing, 640), deltax1)
                mstore(add(_pPairing, 672), deltax2)
                mstore(add(_pPairing, 704), deltay1)
                mstore(add(_pPairing, 736), deltay2)


                let success := staticcall(sub(gas(), 2000), 8, _pPairing, 768, _pPairing, 0x20)

                isOk := and(success, mload(_pPairing))
            }

            let pMem := mload(0x40)
            mstore(0x40, add(pMem, pLastMem))

            // Validate that all evaluations ∈ F
            
            checkField(calldataload(add(_pubSignals, 0)))
            
            checkField(calldataload(add(_pubSignals, 32)))
            
            checkField(calldataload(add(_pubSignals, 64)))
            
            checkField(calldataload(add(_pubSignals, 96)))
            
            checkField(calldataload(add(_pubSignals, 128)))
            
            checkField(calldataload(add(_pubSignals, 160)))
            
            checkField(calldataload(add(_pubSignals, 192)))
            
            checkField(calldataload(add(_pubSignals, 224)))
            
            checkField(calldataload(add(_pubSignals, 256)))
            
            checkField(calldataload(add(_pubSignals, 288)))
            
            checkField(calldataload(add(_pubSignals, 320)))
            
            checkField(calldataload(add(_pubSignals, 352)))
            
            checkField(calldataload(add(_pubSignals, 384)))
            
            checkField(calldataload(add(_pubSignals, 416)))
            
            checkField(calldataload(add(_pubSignals, 448)))
            
            checkField(calldataload(add(_pubSignals, 480)))
            
            checkField(calldataload(add(_pubSignals, 512)))
            
            checkField(calldataload(add(_pubSignals, 544)))
            
            checkField(calldataload(add(_pubSignals, 576)))
            
            checkField(calldataload(add(_pubSignals, 608)))
            
            checkField(calldataload(add(_pubSignals, 640)))
            

            // Validate all evaluations
            let isValid := checkPairing(_pA, _pB, _pC, _pubSignals, pMem)

            mstore(0, isValid)
             return(0, 0x20)
         }
     }
 }
