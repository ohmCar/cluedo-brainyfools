const Player = require('./player.js');
const Character = require('./character.js');
const Path = require('./path.js');
const CardHandler = require('./cardHandler.js');
const characterData = require('./data/characterData.json');
const rooms = require('./data/roomData.json');
const ActivityLog = require('./activityLog');
const getTime = require('../utils/time.js');
const Suspicion = require('./suspicion.js');

class Game {
  constructor(numberOfPlayers, getDate = getTime) {
    this.numberOfPlayers = numberOfPlayers;
    this.players = {};
    this._unAssignedChars = [];
    this.playerCount = 0;
    this.cardHandler = new CardHandler();
    this._murderCombination = {};
    this.started = false;
    this._path = new Path(1,86);
    this._turn = 1;
    this.getDate = getDate;
    this._activityLog = new ActivityLog(getDate);
    this._currentSuspicion = {};
    this._currentAccusation = {};
    this._state = 'running';
  }
  get turn() {
    return this._turn;
  }
  get state(){
    if(!this.getActivePlayers().length){
      this._state = 'draw';
    }
    return this._state;
  }
  get murderCombination(){
    let combination = {
      room: this._murderCombination.room.name,
      weapon: this._murderCombination.weapon.name,
      character: this._murderCombination.character.name
    };
    return combination;
  }
  addPlayer(name, id) {
    let character = characterData[++this.playerCount];
    character = new Character(character);
    let player = new Player(name, character, this.getDate);
    this.players[id] = player;
  }
  getCurrentPlayer() {
    let playerId = this.getCurrentPlayerId();
    return playerId && this.getPlayerDetails(playerId);
  }
  getCurrentPlayerId() {
    let players = Object.keys(this.players);
    return players.find(playerId => {
      let player = this.players[playerId];
      return player.character.turn == this._turn;
    });
  }
  getPlayerCount() {
    return this.playerCount;
  }
  getPlayer(playerId) {
    return this.players[playerId];
  }
  haveAllPlayersJoined() {
    return this.numberOfPlayers == this.playerCount;
  }
  isCurrentPlayer(playerId) {
    let player = this.getPlayer(playerId);
    return player && player.character.turn == this._turn;
  }

  getAllPlayerDetails(id) {
    let players = Object.keys(this.players);
    return players.reduce((details, playerId, index) => {
      let player = this.players[playerId];
      if (playerId == id) {
        details[id] = this.getPlayerData(playerId);
        return details;
      }
      details[index + 1] = this.getPlayerDetails(playerId);
      return details;
    }, {});
  }

  getPlayerData(id) {
    let player = this.players[id];
    let playerDetails = this.getPlayerDetails(id);
    let cards = player._cards.map((originalCard)=>{
      let card = {};
      card.name = originalCard._name;
      card.type = originalCard._type;
      return card;
    });
    playerDetails.cards = cards;
    return playerDetails;
  }

  getPlayerDetails(id) {
    let player = this.players[id];
    return {
      name: player.name,
      inRoom: player.inRoom,
      character: {
        name: player.character.name,
        color: player.character.tokenColor,
        turn: player.character.turn,
        position: player.character.position
      }
    };
  }
  getActivePlayersPos(){
    return Object.values(this.players).map((player) => {
      let char = player.character;
      return {
        name: char.name,
        position: char.position
      };
    });
  }
  addInActivePlayers(){
    let totalChars = Object.keys(characterData).length;
    let playerCount = this.playerCount + 1;
    while (playerCount <= totalChars) {
      let char = characterData[playerCount];
      this._unAssignedChars.push({
        name: char.name,
        position: char.position,
        inactive: true
      });
      ++playerCount;
    }
  }
  getPlayersPosition() {
    let activePlayersPos =this.getActivePlayersPos();
    let nonActivePlayersPos = this._unAssignedChars;
    let allChars = [...activePlayersPos, ...nonActivePlayersPos];
    return allChars;
  }
  hasStarted() {
    return this.started;
  }
  start() {
    this.setMurderCombination();
    this.gatherRemainingCards();
    this.distributeCards();
    this.addInActivePlayers();
    this._path.addRooms(rooms);
    this.addActivity("Game has started");
    this.started = true;
  }
  setMurderCombination() {
    this._murderCombination = this.cardHandler.getRandomCombination();
  }
  getRandomCard(cards) {
    return this.cardHandler.getRandomCard(cards);
  }
  hasRemainingCard() {
    return this.cardHandler.hasRemainingCard();
  }
  distributeCards() {
    let playerIds = Object.keys(this.players);
    while (this.hasRemainingCard()) {
      let currentPlayerId = playerIds.shift();
      let currentPlayer = this.players[currentPlayerId];
      let remainingCards = this.cardHandler._remainingCards;
      currentPlayer.addCard(this.getRandomCard(remainingCards));
      playerIds.push(currentPlayerId);
    }
  }
  rollDice() {
    if (!this.diceVal) {
      this.diceVal = Math.ceil(Math.random() * 6);
    }
    return this.diceVal;
  }
  gatherRemainingCards() {
    this.cardHandler.gatherRemainingCards();
  }
  validateMove(pos){
    let player = this.getCurrentPlayerId();
    let val = this.diceVal;
    let curPlayerPos = this.players[player].character.position;
    let inRoom = false;
    return this._path.validateMove(pos,curPlayerPos,inRoom,val);
  }
  getInvalidMoves(){
    let rooms = ['hall','kitchen','conservatory','ballroom',
      'billiard','dining','study','library','lounge'];
    return [...rooms,...this._path.cells].filter(pos=>{
      return !this.validateMove(pos);
    });
  }
  updatePlayerPos(pos) {
    if (this.playerMoved) {
      return false;
    }
    let currentPlayerId = this.getCurrentPlayerId();
    let currentPlayer = this.getPlayer(currentPlayerId);
    let room = this._path.getRoom(pos);
    currentPlayer.inRoom = !!room;
    this.playerMoved = true;
    return currentPlayer.updatePos(pos);
  }

  updateCharPosition(name,pos){
    this._unAssignedChars.find(char=>{
      if(char.name == name){
        char.position = pos;
        char.inactive = false;
      }
    });
  }
  movePlayerToken(combination){
    let character = combination.character;
    let players = Object.values(this.players);
    let player = players.find(player => {
      return player.character.name == character.name;
    });
    let currentPlayer = this.getCurrentPlayer();
    let pos = currentPlayer.character.position;
    if (player){
      player.updatePos(pos);
    }else{
      this.updateCharPosition(character.name,pos);
    }
  }
  updateSuspicionOf(id,combination) {
    this.movePlayerToken(combination);
    let playerName = this.players[id].name;
    this._currentSuspicion = new Suspicion(combination,playerName);
    this.findCanceller(this.players[id]);
    this.playerMoved = true;
    return true;
  }
  pass() {
    let id = this.getCurrentPlayerId();
    this.players[id]._lastSuspicion = this._currentSuspicion;
    this.playerMoved = false;
    this.diceVal = undefined;
    this._currentSuspicion = {};
    this._currentAccusation = {};
    this._turn = this.getNextPlayerTurn();
    return true;
  }

  getNextPlayerTurn() {
    let players = this.getActivePlayers();
    let player = players.find(player => {
      return player.character.turn > this.turn;
    });
    if (!player) {
      player = players[0];
    }
    if(!player){
      return 0;
    }
    return player.character.turn;
  }
  getActivePlayers(){
    let players = Object.values(this.players);
    return players.filter((player)=>{
      return player.isActive();
    });
  }
  getPlayerByTurn(turn){
    let players = Object.values(this.players);
    return players.find(player => {
      return player.character.turn == turn;
    });
  }
  findCanceller(currentPlayer){
    let suspicion = this._currentSuspicion;
    let turn = currentPlayer.character.turn;
    let nextTurn = this.getNextTurn(turn);
    while (turn != nextTurn) {
      let nextPlayer = this.getPlayerByTurn(nextTurn);
      if(nextPlayer.canCancel(suspicion)){
        suspicion.canBeCancelled = true;
        suspicion.cancellerName = nextPlayer.name;
        suspicion.canceller = this.getPlayerId(nextTurn);
        suspicion.cancellingCards = nextPlayer.getCancellingCards(suspicion);
        return;
      }
      nextTurn = this.getNextTurn(nextTurn);
    }
    suspicion.cancellingCards = [];
    suspicion.canBeCancelled = false;
    this.addActivity('No one ruled out');
  }
  getPlayerId(turn){
    let playerIds = Object.keys(this.players);
    return playerIds.find(id=>this.players[id].character.turn==turn);
  }
  getNextTurn(turn){
    let players = Object.values(this.players)
      .sort((player1,player2)=>player1.character.turn > player2.character.turn);
    let player = players.find(player =>player.character.turn > turn);
    if (!player) {
      player = players[0];
    }
    return player.character.turn;
  }
  isSuspecting() {
    return !this.isEmpty(this._currentSuspicion);
  }
  isAccusing() {
    return !this.isEmpty(this._currentAccusation);
  }
  isEmpty(suspicion){
    return JSON.stringify(suspicion) == '{}';
  }
  getCombination(accusation){
    let suspicion = accusation || this._currentSuspicion;
    if(this.isEmpty(suspicion)||!suspicion.combination.room){
      return {};
    }
    let combination = {
      room: suspicion.combination.room.name,
      weapon: suspicion.combination.weapon.name,
      character: suspicion.combination.character.name
    };
    return combination;
  }

  getAccuseCombination(){
    let accusation = this._currentAccusation;
    return this.getCombination(accusation);
  }
  addActivity(activity){
    let timeOfActivity = this._activityLog.addActivity(activity);
    return timeOfActivity;
  }
  getSuspicion(playerId){
    let suspicion = this._currentSuspicion;
    let result = {
      combination : suspicion.combination,
      cancelled : suspicion.cancelled,
      cancelledBy : suspicion.cancellerName,
      canBeCancelled : suspicion.canBeCancelled,
      currentPlayer : suspicion.suspector
    };
    if(suspicion.canceller==playerId){
      result.cancellingCards = suspicion.cancellingCards;
    }
    if(playerId == this.getCurrentPlayerId()){
      result.ruleOutCard = suspicion.ruleOutCard;
      result.suspector = suspicion.suspector;
    }
    return result;
  }
  getActivitiesAfter(time, playerId) {
    let gameActivities = this._activityLog.getActivitiesAfter(time);
    let playerLog = this.getPlayer(playerId).getActivitiesAfter(time);
    let allLogs = [...gameActivities,...playerLog];
    return allLogs;
  }
  canRuleOut(playerId, ruleOutCard){
    let suspicion = this.getSuspicion(playerId);
    let card = suspicion.cancellingCards.find(card=>card._name == ruleOutCard);
    return !!card;
  }
  ruleOut(card){
    let suspicion = this._currentSuspicion;
    let id = this.getCurrentPlayerId();
    this.getPlayer(id).addActivity(`Ruled out by ${
      suspicion.cancellerName} using ${card} card`);
    suspicion.cancelled = true;
    suspicion.ruleOutCard = card;
  }
  canSuspect(){
    let currentPlayer = this.getPlayer(this.getCurrentPlayerId());
    return currentPlayer.canSuspect();
  }
  isPlayerInRoom(){
    let currentPlayer = this.getPlayer(this.getCurrentPlayerId());
    return !!this._path.isRoom(currentPlayer.character.position);
  }
  accuse(combination){
    this.movePlayerToken(combination);
    let id = this.getCurrentPlayerId();
    let player = this.players[id];
    let name = player.name;
    this._currentAccusation = new Suspicion(combination,name);
    if(this.isCorrectAccusation()){
      this._state = 'win';
      this.addActivity(`${name} has won the game`);
    } else {
      player.deactivate();
      this.addActivity(`${name} accusation failed`);
    }
    return true;
  }
  isCorrectAccusation(){
    let combination = this._currentAccusation.combination;
    return this._murderCombination.isEqualTo(combination);
  }
  getAccusationState(){
    if(!this.isEmpty(this._currentAccusation)){
      return !this.isCorrectAccusation();
    }
    return false;
  }
  getSecretPassage(){
    let player = this.getCurrentPlayer();
    if(player.inRoom){
      return this._path.getConnectedRoom(player.character.position);
    }
    return '';
  }
}

module.exports = Game;
