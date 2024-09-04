import jwt from "jsonwebtoken";
dotenv.config();
const verifyToken = (req, res, next) => {
    const token = req.cookies.token || req.headers.authorization?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'No se proporcionó un token' });
    }

    const secretKey = process.env.JWT_SECRET_KEY;

    try {
        const decoded = jwt.verify(token, secretKey);
        req.user = decoded;
        next(); 
    } catch (error) {
        return res.status(401).json({ error: 'Token inválido o expirado' });
    }
};

module.exports = verifyToken;