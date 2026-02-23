import validator from "validator";
import { supabase } from "../config/supabase.js"
import { CASE_PRIORITY, CASE_STATUS, STATUS, UUIDCASE } from "../utils/constants.js";
import { isAdminForBack, isUser } from "./user.interceptor.js";
import { errorResponseBody } from "../utils/responseBody.js";

const validatePriority = (req, res, next) => {
    const { priority } = req.body;

    if (!Object.values(CASE_PRIORITY).includes(priority)) {
        return res.status(400).json({
            error: "Invalid Field Value",
            message: `Invalid priority. Must be one of: ${Object.values(CASE_PRIORITY).join(', ')}.`
        });
    }
    next();
};

const validateDeadline = (req, res, next) => {
    const { deadline } = req.body;

    if (deadline && isNaN(Date.parse(deadline))) {
        return res.status(STATUS.BAD_REQUEST).json({
            error: "Invalid Field Format",
            message: "Invalid date format for deadline. Use YYYY-MM-DD."
        });
    }
    next();
};

const validateOfficerEmails = (req, res, next) => {
    const { assigned_officer_emails } = req.body;

    if (!Array.isArray(assigned_officer_emails)) {
        return res.status(STATUS.BAD_REQUEST).json({
            error: "Invalid Format",
            message: "assigned_officer_emails must be an array."
        });
    }

    if (assigned_officer_emails.length === 0) {
        return res.status(STATUS.BAD_REQUEST).json({
            error: "Missing Data",
            message: "At least one officer email is required."
        });
    }

    const invalidEmails = assigned_officer_emails.filter(email =>
        typeof email !== 'string' || !validator.isEmail(email)
    );

    if (invalidEmails.length > 0) {
        return res.status(STATUS.BAD_REQUEST).json({
            error: "Invalid Field Format",
            message: "One or more provided emails are invalid.",
            invalid_emails: invalidEmails
        });
    }

    next();
};

const validateCaseNumber = (req, res, next) => {
    const { case_number } = req.body;

    if (!case_number) {
        return res.status(STATUS.BAD_REQUEST).json({
            error: "Missing Required Field",
            message: "case_number is required."
        });
    }

    if (typeof case_number !== 'string' || case_number.trim().length === 0) {
        return res.status(STATUS.BAD_REQUEST).json({
            error: "Invalid Format",
            message: "case_number must be a valid non-empty string."
        });
    }

    next();
};

const validateTitle = (req, res, next) => {
    const { title } = req.body;

    if (!title) {
        return res.status(STATUS.BAD_REQUEST).json({
            error: "Missing Required Field",
            message: "title is required."
        });
    }

    if (typeof title !== 'string' || (title.trim().length < 2 && title.trim().length > 20)) {
        return res.status(STATUS.BAD_REQUEST).json({
            error: "Invalid Format",
            message: "title must be 2 characters long."
        });
    }

    next();
};

const validateSectionIPC = (req, res, next) => {
    const { section_under_ipc } = req.body;

    if (!section_under_ipc) {
        return res.status(STATUS.BAD_REQUEST).json({
            error: "Missing Required Field",
            message: "section_under_ipc is required."
        });
    }

    // Ensure it's not just whitespace
    if (typeof section_under_ipc !== 'string' || section_under_ipc.trim().length === 0) {
        return res.status(STATUS.BAD_REQUEST).json({
            error: "Invalid Format",
            message: "section_under_ipc must be a valid string."
        });
    }

    next();
};

const validateUnder7Years = (req, res, next) => {
    const { under_7_years } = req.body;

    if (under_7_years !== undefined && typeof under_7_years !== "boolean") {
        return res.status(400).json({
            status: "error",
            message: "Invalid format for under_7_years. Must be true or false."
        });
    }

    next();
};

const validateCase = [
    validateCaseNumber,
    validateTitle,
    validateSectionIPC,
    validatePriority,
    validateDeadline,
    validateOfficerEmails,
    validateUnder7Years
];

const validateGetOfficersCasesCount = async (req, res, next) => {
    const currentUser = req.user;
    const officerId = req.query.user_id;
    const status = req.query.status;

    if (officerId && !UUIDCASE.CASE.test(officerId)) {
        const response = { ...errorResponseBody };
        response.message = "Validation Failed";
        response.err = { user_id: "Invalid officer ID format." };
        return res.status(STATUS.BAD_REQUEST).json(response);
    }

    if (status) {
        const validStatuses = Object.values(CASE_STATUS);

        if (!validStatuses.includes(status)) {
            const response = { ...errorResponseBody };
            response.message = "Validation Failed";
            response.err = {
                status: `Invalid status. Allowed: ${validStatuses.join(', ')}`
            };
            return res.status(STATUS.BAD_REQUEST).json(response);
        }
    }

    try {
        // const isUserAdmin = await isAdminForBack({ user_id: currentUser.user_id });

        // if (!isUserAdmin) {
        //     throw {
        //         code: STATUS.FORBIDDEN,
        //         message: "Access denied. Admin privileges required.",
        //         err: { role: "Insufficient permissions" }
        //     }
        // }

        // if (officerId) await isUser({ user_id: officerId });
        next();
    }
    catch (error) {
        if (error.code) {
            const response = { ...errorResponseBody };
            response.message = error.message;
            response.err = error.err;
            return res.status(error.code).json(response);
        }
        const response = { ...errorResponseBody };
        response.message = "Something went wrong";
        response.err = { details: error.message };

        return res.status(STATUS.INTERNAL_SERVER_ERROR).json(response);
    }
}

const validateGetCaseId = async (req, res, next) => {
    const officerId = req.params.user_id;

    if (!officerId || !UUIDCASE.CASE.test(officerId)) {
        const response = { ...errorResponseBody };

        console.log("HI");

        response.message = "Validation Failed";
        response.err = {
            user_id: "Invalid officer ID provided. The ID must be a valid UUID format."
        };

        return res.status(STATUS.BAD_REQUEST).json(response);
    }

    try {
        await isUser({ user_id: officerId });
        next();
    } catch (error) {
        if (error.code) {
            const response = { ...errorResponseBody };
            response.message = error.message;
            response.err = error.err;
            return res.status(error.code).json(response);
        }
        const response = { ...errorResponseBody };
        response.message = "Something went wrong";
        response.err = { details: error.message };

        return res.status(STATUS.INTERNAL_SERVER_ERROR).json(response);
    }
}

const validateGetCaseEmailId = async (req, res, next) => {
    const currentUser = req.user;
    const { email_id } = req.body;

    if (!email_id) {
        const response = { ...errorResponseBody };
        response.message = "Validation Failed";
        response.err = {
            email_id: "Email ID is missing from the request body."
        };
        return res.status(STATUS.BAD_REQUEST).json(response);
    }

    if (!validator.isEmail(email_id)) {
        const response = { ...errorResponseBody };
        response.message = "Validation Failed";
        response.err = {
            email_id: "Invalid email format provided."
        };
        return res.status(STATUS.BAD_REQUEST).json(response);
    }

    try {
        const isUserAdmin = await isAdminForBack({ user_id: currentUser.user_id });

        if (!isUserAdmin) {
            throw {
                code: STATUS.FORBIDDEN,
                message: "Access denied. Admin privileges required.",
                err: { role: "Insufficient permissions" }
            }
        }

        next();
    }
    catch (error) {
        console.error("Validate Case Email ID Error: ", error);

        if (error.code) {
            const response = { ...errorResponseBody };
            response.message = error.message;
            response.err = error.err || {};
            return res.status(error.code).json(response);
        }

        const response = { ...errorResponseBody };
        response.message = "Internal Server Error";
        response.err = {
            details: error.message || "An unexpected error occurred during validation."
        };

        return res.status(STATUS.INTERNAL_SERVER_ERROR).json(response);
    }
}

const isUserInCase = async (data) => {
    const { case_id, user_id } = data;
    const { data: caseData, error } = await supabase
        .from('case_users')
        .select('case_id, user_id')
        .eq('case_id', case_id)
        .eq('user_id', user_id)
        .maybeSingle();

    if (error) throw error;

    return caseData !== null; // returns true or false
};

const validateCaseUpdate = async (req, res, next) => {
    const currentUser = req.user;
    const { case_id, case_number, title, status, priority, deadline, section_under_ipc, under_7_years, stage, assigned_officers } = req.body;

    if (!case_number) {
        const response = { ...errorResponseBody };
        response.message = "Validation Failed";
        response.err = { case_number: "Case number is required to perform an update." };
        return res.status(STATUS.BAD_REQUEST).json(response);
    }

    if (!case_id || !UUIDCASE.CASE.test(case_id)) {
        const response = { ...errorResponseBody };
        response.message = "Validation Failed";
        response.err = {
            case_id: !case_id
                ? "Case ID is required to perform an update."
                : "Invalid Case ID format."
        };
        return res.status(STATUS.BAD_REQUEST).json(response);
    }

    try {
        // Check case_id and case_number belong to same case
        const { data: caseData, error } = await supabase
            .from("cases")
            .select("case_id, case_number")
            .eq("case_id", case_id)
            .eq("case_number", case_number)
            .maybeSingle();

        if (error) throw error;

        if (!caseData) {
            const response = { ...errorResponseBody };
            response.message = "Validation Failed";
            response.err = { case_number: "Case number and Case ID do not belong to the same case." };
            return res.status(STATUS.BAD_REQUEST).json(response);
        }

        // Check authority — must be admin OR in case
        const adminCheck = await isAdminForBack({ user_id: currentUser.user_id });
        const assignedCheck = await isUserInCase({ case_id: case_id, user_id: currentUser.user_id });

        if (!adminCheck && !assignedCheck) {
            const response = { ...errorResponseBody };
            response.message = "Validation Failed";
            response.err = { details: "You don't have privileges to update this case." };
            return res.status(STATUS.FORBIDDEN).json(response);
        }

        // Build updates object
        const updates = {};
        if (title) updates.title = title;
        if (status) updates.status = status;
        if (priority) updates.priority = priority;
        if (deadline) updates.deadline = deadline;
        if (section_under_ipc) updates.section_under_ipc = section_under_ipc;
        if (under_7_years !== undefined) updates.under_7_years = under_7_years;
        if (stage !== undefined && stage >= 1) updates.stage = stage;

        // Check at least one field or officer is provided
        const hasOfficers = Array.isArray(assigned_officers) && assigned_officers.length > 0;

        if (Object.keys(updates).length === 0 && !hasOfficers) {
            const response = { ...errorResponseBody };
            response.message = "Validation Failed";
            response.err = {
                details: "No valid fields provided for update. Please provide at least one field."
            };
            return res.status(STATUS.BAD_REQUEST).json(response);
        }

        // If officers provided and not admin — must include self
        if (hasOfficers && !adminCheck) {
            const isSelfIncluded = assigned_officers.includes(currentUser.user_id);
            if (!isSelfIncluded) {
                const response = { ...errorResponseBody };
                response.message = "Validation Failed";
                response.err = { assigned_officers: "You cannot remove yourself from the case." };
                return res.status(STATUS.FORBIDDEN).json(response);
            }
        }

        // Pass everything to controller via req
        req.validCaseUpdates = updates;
        req.targetCaseNumber = case_number;
        req.targetCaseId = case_id;
        req.isAdmin = adminCheck;
        req.validAssignedOfficers = hasOfficers ? assigned_officers : null;

        next();

    } catch (error) {
        console.error("Validate Case Update Error:", error);
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json({
            ...errorResponseBody,
            message: "Internal Server Error",
            err: { details: error.message }
        });
    }
};

const validateCaseDeletion = async (req, res, next) => {
    const case_number = req.params.case_number;

    if (!case_number) {
        const response = { ...errorResponseBody };
        response.message = "Validation Failed";
        response.err = {
            case_number: "Case Number parameter is missing."
        };
        return res.status(STATUS.BAD_REQUEST).json(response);
    }

    try {
        const { data: existingCase, error } = await supabase
            .from("cases")
            .select("case_id")
            .eq("case_number", case_number)
            .maybeSingle();

        if (error) throw error;

        if (!existingCase) {
            const response = { ...errorResponseBody };
            response.message = "Deletion Failed";
            response.err = {
                case_number: `Case with number '${case_number}' not found.`
            };
            return res.status(STATUS.NOT_FOUND).json(response);
        }

        req.validCaseId = existingCase.case_id;

        next();

    } catch (error) {
        console.error("Validate Case Deletion Error:", error);

        const response = { ...errorResponseBody };
        response.message = "Internal Server Error";
        response.err = { details: error.message };

        return res.status(STATUS.INTERNAL_SERVER_ERROR).json(response);
    }
};

const validateGetCase = async (req, res, next) => {
    const caseNumber = req.query.case_number;

    if (caseNumber) {
        req.targetCaseNumber = caseNumber;
    }

    next();
};

const getDeletedCaseValidate = async (req, res, next) => {
    const caseNumber = req.query.case_number;

    if (caseNumber) {
        req.targetCaseNumber = caseNumber;
    }

    next();
};

const updateDeletedCaseValidate = async (req, res, next) => {
    try {
        const currentUser = req.user;
        const { case_id, officer_ids } = req.body;

        const isUserAdmin = await isAdminForBack({ user_id: currentUser.user_id });
        if (!isUserAdmin) {
            return res.status(STATUS.FORBIDDEN).json({
                ...errorResponseBody,
                message: "Access denied. Admin privileges required.",
                err: { role: "Insufficient permissions" }
            });
        }

        if (!case_id) {
            return res.status(STATUS.BAD_REQUEST).json({
                ...errorResponseBody,
                message: "Validation Failed",
                err: { case_id: "case_id is required." }
            });
        }

        if (typeof case_id !== "string" || !UUIDCASE.CASE.test(case_id)) {
            return res.status(STATUS.BAD_REQUEST).json({
                ...errorResponseBody,
                message: "Validation Failed",
                err: { case_id: "case_id must be a valid UUID." }
            });
        }

        if (!officer_ids) {
            return res.status(STATUS.BAD_REQUEST).json({
                ...errorResponseBody,
                message: "Validation Failed",
                err: { officer_ids: "officer_ids is required." }
            });
        }

        if (!Array.isArray(officer_ids)) {
            return res.status(STATUS.BAD_REQUEST).json({
                ...errorResponseBody,
                message: "Validation Failed",
                err: { officer_ids: "officer_ids must be an array." }
            });
        }

        if (officer_ids.length === 0) {
            return res.status(STATUS.BAD_REQUEST).json({
                ...errorResponseBody,
                message: "Validation Failed",
                err: { officer_ids: "officer_ids must not be empty." }
            });
        }

        if (!officer_ids.every(id => typeof id === "string" && UUIDCASE.CASE.test(id))) {
            return res.status(STATUS.BAD_REQUEST).json({
                ...errorResponseBody,
                message: "Validation Failed",
                err: { officer_ids: "Each officer_id must be a valid UUID." }
            });
        }

        next();

    } catch (error) {
        if (error.code) {
            return res.status(error.code).json({
                ...errorResponseBody,
                message: error.message,
                err: error.err
            });
        }

        console.error("updateDeletedCaseValidate Middleware Error:", error);
        return res.status(STATUS.INTERNAL_SERVER_ERROR).json({
            ...errorResponseBody,
            message: "Internal server error during verification validation."
        });
    }
};

export default {
    validateCase,
    validateGetOfficersCasesCount,
    validateGetCaseId,
    validateGetCaseEmailId,
    validateCaseUpdate,
    validateCaseDeletion,
    validateGetCase,
    getDeletedCaseValidate,
    updateDeletedCaseValidate
};