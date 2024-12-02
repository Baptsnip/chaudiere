const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const net = require('net');

// Initialisation des variables
const temperatures = [20.0, 22.5, 25.0]; // $RDTEMP
let valveMode = 0; // $GETVAN (0: chauffage, 1: ECS, 2: indéfini)
let burnerState = 0; // $GETBRU (0: off, 1: on)
let heatingRequest = 0; // $CMDCHAU (0: off, 1: on)
let ledState = 0; // LED (0: éteinte, 1: allumée) - Géré par la demande de chauffage

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Middleware pour servir les fichiers statiques
app.use(express.static('public'));

// Routes
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

// WebSocket pour synchroniser l'interface
io.on('connection', (socket) => {
    console.log('Client connecté à l\'interface web');

    // Envoi des états initiaux
    socket.emit('updateState', { temperatures, valveMode, burnerState, heatingRequest, ledState });

    // Mise à jour des températures via sliders
    socket.on('setTemperature', ({ index, value }) => {
        if (index >= 0 && index < temperatures.length) {
            temperatures[index] = value;
            io.emit('updateTemperatures', temperatures);
        }
    });

    // Mise à jour de l'état du brûleur
    socket.on('setBurnerState', ({ state }) => {
        burnerState = state;
        io.emit('updateBurnerState', burnerState);
    });

    // Mise à jour du mode de la vanne
    socket.on('setValveMode', ({ mode }) => {
        valveMode = mode;
        io.emit('updateValveMode', valveMode);
    });

    // Mise à jour de la demande de chauffage
    socket.on('setHeatingRequest', ({ state }) => {
        heatingRequest = state;
        ledState = heatingRequest; // Allumer la LED si chauffage demandé
        io.emit('updateHeatingRequest', heatingRequest);
        io.emit('updateLedState', ledState); // Synchroniser la LED avec le chauffage
    });
});

// Serveur Telnet
const telnetServer = net.createServer((socket) => {
    console.log('Client connecté via Telnet');

    socket.on('data', (data) => {
        const command = data.toString().trim();
        console.log(`Commande Telnet reçue : ${command}`);

        if (command.startsWith('$RDTEMP')) {
            const index = parseInt(command.replace('$RDTEMP', ''), 10);
            if (!isNaN(index) && index >= 0 && index < temperatures.length) {
                socket.write(`${temperatures[index].toFixed(1)}\r\n`);
            } else {
                socket.write('Erreur : Index de température invalide\r\n');
            }
        } else if (command.startsWith('$SETTEMP')) {
            const [_, idx, val] = command.split(' ');
            const index = parseInt(idx, 10);
            const value = parseFloat(val);
            if (!isNaN(index) && index >= 0 && index < temperatures.length && !isNaN(value)) {
                temperatures[index] = value;
                socket.write(`${value.toFixed(1)}\r\n`);
                io.emit('updateTemperatures', temperatures);
            } else {
                socket.write('Erreur : Commande SETTEMP invalide\r\n');
            }
        } else if (command === '$GETVAN') {
            socket.write(`${valveMode}\r\n`);
        } else if (command.startsWith('$SETVAN')) {
            const mode = parseInt(command.split(' ')[1], 10);
            if ([0, 1, 2].includes(mode)) {
                valveMode = mode;
                socket.write(`${mode}\r\n`);
                io.emit('updateValveMode', valveMode);
            } else {
                socket.write('Erreur : Mode vanne invalide\r\n');
            }
        } else if (command === '$GETBRU') {
            socket.write(`${burnerState}\r\n`);
        } else if (command.startsWith('$SETBRU')) {
            const state = parseInt(command.split(' ')[1], 10);
            if ([0, 1].includes(state)) {
                burnerState = state;
                socket.write(`${state}\r\n`);
                io.emit('updateBurnerState', burnerState);
            } else {
                socket.write('Erreur : État du brûleur invalide\r\n');
            }
        } else if (command === '$CMDCHAU') {
            socket.write(`${heatingRequest}\r\n`);
        } else if (command.startsWith('$CMDCHAU')) {
            const state = parseInt(command.split(' ')[1], 10);
            if ([0, 1].includes(state)) {
                heatingRequest = state;
                ledState = heatingRequest; // Allume ou éteint la LED selon l'état du chauffage
                socket.write(`${state}\r\n`);
                io.emit('updateHeatingRequest', heatingRequest);
                io.emit('updateLedState', ledState);
            } else {
                socket.write('Erreur : État de la demande de chauffage invalide\r\n');
            }
        } else if (command.startsWith('$SETLED')) {
            const state = parseInt(command.split(' ')[1], 10);
            if ([0, 1].includes(state)) {
                ledState = state; // Mettre à jour l'état de la LED
                socket.write(`${state}\r\n`); // Confirme l'état mis à jour
                io.emit('updateLedState', ledState); // Synchronise l'état avec l'interface
            } else {
                socket.write('Erreur : Commande SETLED invalide\r\n');
            }
        } else if (command === '$GETLED') {
            socket.write(`${ledState}\r\n`); // Retourne l'état actuel de la LED
        } else {
            socket.write(`Commande inconnue : ${command}\r\n`);
        }
    });

    socket.on('end', () => {
        console.log('Client Telnet déconnecté');
    });

    socket.on('error', (err) => {
        console.error(`Erreur sur le socket : ${err.message}`);
    });
});

// Lancement des serveurs
const HTTP_PORT = 3000;
const TELNET_PORT = 8080;

server.listen(HTTP_PORT, () => {
    console.log(`Serveur HTTP lancé sur http://localhost:${HTTP_PORT}`);
});

telnetServer.listen(TELNET_PORT, () => {
    console.log(`Serveur Telnet lancé sur le port ${TELNET_PORT}`);
});

// Gestion globale des erreurs
process.on('uncaughtException', (err) => {
    console.error('Erreur non gérée :', err.message);
});
