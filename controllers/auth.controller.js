import authService from "../services/auth.service.js"

import { STATUS } from "../utils/constants.js"
import { successResponseBody } from "../utils/responseBody.js"

const signup = async(req, res) => {
    try {
        const data = req.body;
        
        const result = await authService.signupUser(data);

        successResponseBody.data = result;
        successResponseBody.message = "User registered successfully.";
        
        return res.status(STATUS.CREATED).json(successResponseBody);
        
    } catch(error) {
        console.error("Signup Controller Error:", error);

        if(error.code) {
           return res.status(error.code).json(error);
        }
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json({
            message: "Something went wrong.",
            success: false
        });
    }
}

const signin = async(req, res) => {
    try {
        const data = req.body;
        
        const { user, token } = await authService.signinUser(data);

        const isWebClient = req.headers["x-client-type"] === "web";

        if(isWebClient) {
            res.cookie("auth_token", token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "Strict",
                maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
            });
            successResponseBody.data = user;  // Website
        } else {
            successResponseBody.data = { ...user, token }; // app
        }
        
        successResponseBody.message = "User sign in successfully.";
        
        console.log(successResponseBody);
        return res.status(STATUS.CREATED).json(successResponseBody);

    } catch(error) {
        console.error("Signin Controller Error:", error);

        if(error.code) {
           return res.status(error.code).json(error);
        }
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json({
            message: "Something went wrong.",
            success: false
        });
    }
}

function signout(req, res) {
	res.status(200).json({ message: 'Successfully logged out' });
}

export default {
    signup,
    signin,
    signout
}