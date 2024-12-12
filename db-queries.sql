DROP DATABASE if EXISTS `andarbahar`;
CREATE DATABASE IF NOT EXISTS `andarbahar`;
use `andarbahar`;

 CREATE TABLE IF NOT EXISTS `settlement`(
   `settlement_id` int NOT NULL AUTO_INCREMENT,
   `bet_id` varchar(255) NOT NULL,
   `lobby_id` varchar(255) NOT NULL ,
   `user_id` varchar(255) NOT NULL,
   `operator_id` varchar(255) DEFAULT NULL,
   `bet_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
   `bet_data` TEXT DEFAULT NULL,
   `room_id` INT NOT NULL,
   `win_amount` decimal(10, 2) DEFAULT 0.00,
   `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
   PRIMARY KEY (`settlement_id`)
 );



CREATE TABLE IF NOT EXISTS `lobbies` (
   `id` int primary key  auto_increment,
   `lobby_id` varchar(255) NOT NULL,
   `match_id` varchar(255) NOT NULL,
   `result` INT NOT NULL DEFAULT 0,
   `jokerCard` INT NOT NULL,
   `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
   `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
 );


CREATE TABLE IF NOT EXISTS `bets` (
   `id` int primary key  auto_increment,
   `bet_id` varchar(255) NOT NULL,
   `lobby_id`varchar(255) NOT NULL ,
   `user_id` varchar(255) NOT NULL,
   `operator_id` varchar(255) DEFAULT NULL,
   `bet_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
   `bet_data` TEXT DEFAULT NULL,
   `room_id` INT NOT NULL,
   `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
   `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
 ); 

CREATE TABLE `game_templates` (
   `id` int not null auto_increment,
   `data` TEXT NOT NULL,
   `is_active` tinyint NOT NULL DEFAULT '1',
   `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
   `updated_at` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
   PRIMARY KEY (`id`)
 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

 INSERT INTO game_templates (data) VALUES
('{
    "rmId": 102,
    "mnEy": 50,
    "mnBt": 10,
    "mxBt": 250,
    "btCn": [10, 50, 100, 150, 250]
}'),
('{
    "rmId": 101,
    "mnEy": 200,
    "mnBt": 100,
    "mxBt": 500,
    "btCn": [100, 200, 300, 400, 500]
}'),
('{
    "rmId": 103,
    "mnEy": 250,
    "mnBt": 200,
    "mxBt": 1000,
    "btCn": [200, 350, 500, 750, 1000]
}'),
('{
    "rmId": 104,
    "mnEy": 1000,
    "mnBt": 500,
    "mxBt": 2000,
    "btCn": [500, 800, 1000, 1500, 2000]
}');


ALTER TABLE `andarbahar`.`bets` ADD INDEX `inx_bet_id` (`bet_id` ASC) INVISIBLE, ADD INDEX `inx_lobby_id` (`lobby_id` ASC) INVISIBLE, ADD INDEX `inx_user_id` (`user_id` ASC) INVISIBLE, ADD INDEX `inx_operator_id` (`operator_id` ASC) VISIBLE, ADD INDEX `inx_bet_amount` (`bet_amount` ASC) INVISIBLE, ADD INDEX `inx_room_id` (`room_id` ASC) VISIBLE, ADD INDEX `inx_created_at` (`created_at` ASC) VISIBLE;

ALTER TABLE `andarbahar`.`settlement` ADD INDEX `inx_bet_id` (`bet_id` ASC) VISIBLE, ADD INDEX `inx_lobby_id` (`lobby_id` ASC) VISIBLE, ADD INDEX `inx_user_id` (`user_id` ASC) INVISIBLE, ADD INDEX `inx_operator_id` (`operator_id` ASC) VISIBLE, ADD INDEX `inx_bet_amount` (`bet_amount` ASC) INVISIBLE, ADD INDEX `inx_room_id` (`room_id` ASC) INVISIBLE, ADD INDEX `inx_win_amount` (`win_amount` ASC) INVISIBLE, ADD INDEX `inx_created_at` (`created_at` ASC) VISIBLE;

ALTER TABLE `andarbahar`.`lobbies` ADD INDEX `inx_lobby_id` (`lobby_id` ASC) INVISIBLE, ADD INDEX `inx_created_at` (`created_at` ASC) VISIBLE;