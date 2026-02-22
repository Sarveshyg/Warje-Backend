import argon2 from 'argon2';

// Argon2id config — tweak based on your server capacity
const ARGON2_OPTIONS = {
    type: argon2.argon2id,
    memoryCost: 2 ** 16,  // 64MB
    timeCost: 3,           // iterations
    parallelism: 1
};

// Hash OTP
export const hashOTP = async (otp) => {
    return await argon2.hash(otp, ARGON2_OPTIONS);
};

// Verify OTP
export const verifyOTP = async (plainOTP, hashedOTP) => {
    return await argon2.verify(hashedOTP, plainOTP); // argon2 always: (hash, plain)
};

// hash password
export const hashPassword = async (password) => {
    return await argon2.hash(password, ARGON2_OPTIONS);
};

// Verify Password
export const verfiyPassword = async (plainPassword, hashPassword) => {
    return await argon2.verify(hashPassword, plainPassword); // argon2 always : (hash, plain)
}