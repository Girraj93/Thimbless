DROP DATABASE if EXISTS `thimbles`;
CREATE DATABASE IF NOT EXISTS `thimbles`;
use `thimbles`;

 CREATE TABLE IF NOT EXISTS `settlement`(
   `settlement_id` int NOT NULL AUTO_INCREMENT,
   `bet_id` varchar(255) NOT NULL,
   `user_id` varchar(255) NOT NULL,
   `operator_id` varchar(255) DEFAULT NULL,
   `bet_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
   `win_amount` decimal(10, 2) DEFAULT 0.00,
   `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
   PRIMARY KEY (`settlement_id`)
 );

CREATE TABLE IF NOT EXISTS `bets` (
   `id` int primary key  auto_increment,
   `bet_id` varchar(255) NOT NULL,
   `user_id` varchar(255) NOT NULL,
   `operator_id` varchar(255) DEFAULT NULL,
   `bet_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    `bet_on` varchar(255) NOT NULL,
   `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
   `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
 ); 

 ALTER TABLE `thimbles`.`bets` ADD INDEX `inx_bet_id` (`bet_id` ASC) INVISIBLE, ADD INDEX `inx_user_id` (`user_id` ASC) INVISIBLE, ADD INDEX `inx_operator_id` (`operator_id` ASC) VISIBLE, ADD INDEX `inx_bet_amount` (`bet_amount` ASC) INVISIBLE, ADD INDEX `inx_bet_on` (`bet_on` ASC) INVISIBLE, ADD INDEX `inx_created_at` (`created_at` ASC) VISIBLE;

 ALTER TABLE `thimbles`.`settlement` ADD INDEX `inx_bet_id` (`bet_id` ASC) VISIBLE, ADD INDEX `inx_user_id` (`user_id` ASC) INVISIBLE, ADD INDEX `inx_operator_id` (`operator_id` ASC) VISIBLE, ADD INDEX `inx_bet_amount` (`bet_amount` ASC) INVISIBLE, ADD INDEX `inx_win_amount` (`win_amount` ASC) INVISIBLE, ADD INDEX `inx_created_at` (`created_at` ASC) VISIBLE;
