import BigNumber from 'bignumber.js';
import dotenv from 'dotenv';

dotenv.config();

// Lowest precision we ever go for: MicroLamports represented in Sol amount
BigNumber.config({ EXPONENTIAL_AT: 16 });
