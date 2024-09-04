import jwt from "jsonwebtoken";
dotenv.config();
const authenticateToken = (req, res, next) => {
    const token = req.cookies.token;

    if (!token) {
        return res.status(401).json({ error: 'No se proporcionó un token' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY || 'default-secret-key');
        req.user = decoded;
        next();
    } catch (err) {
        console.error('Error al verificar el token:', err);
        return res.status(401).json({ error: 'Token inválido' });
    }
};

module.exports = authenticateToken;
