import { CONTRACT_ADDRESS, CONTRACT_ABI } from "./config.js";

/**
 * @title 
 * @notice 
 * @returns {Object}
 */
export async function initWeb3() {
    try {
        if (window.ethereum) {
            const web3 = new Web3(window.ethereum);
            const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
            console.log("Connected account:", accounts[0]);          
            const contract = new web3.eth.Contract(CONTRACT_ABI, CONTRACT_ADDRESS);
            console.log("Contract loaded:", contract);      
            return { web3, accounts, contract };
        } else {
           alerte("MetaMask n'est pas installé !");
            return null;
        }
    } catch (error) {
        console.error("Web3 init error:", error);
        return null;
    }
}

