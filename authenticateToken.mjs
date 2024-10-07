import jwt from 'jsonwebtoken';

const authenticateToken = (req, res, next) => {
    const token = req.cookies.token; // Obtén el token de las cookies
    console.log('Token recibido:', token);

    if (!token) {
        console.log('No se encontró el token');
        return res.sendStatus(401); // No hay token, respuesta no autorizada
    }

    jwt.verify(token, process.env.JWT_SECRET_KEY, (err, user) => {
        if (err) {
            console.log('Error al verificar el token:', err);
            return res.sendStatus(403); // Token no válido
        }

        console.log('Token verificado con éxito. Usuario:', user);
        req.user = user;
        next();
    });
};


export default authenticateToken;
