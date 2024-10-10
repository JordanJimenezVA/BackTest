import jwt from 'jsonwebtoken';

const authenticateToken = (req, res, next) => {
    const token = req.cookies.token; // Obtén el token de las cookies
    if (!token) {
        return res.sendStatus(401); // No hay token, respuesta no autorizada
    }
    jwt.verify(token, process.env.JWT_SECRET_KEY, (err, user) => {
        if (err) {

            return res.sendStatus(403); // Token no válido
        }
        req.user = user;
        next();
    });
};


export default authenticateToken;
