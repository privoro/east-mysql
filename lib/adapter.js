/**
 * adapter
 */

"use strict";


/* Node modules */
var path = require("path");


/* Third-party modules */
var async = require("async");
var mysql = require("mysql");
var connectonString = require("pg-connection-string");


/* Files */



function Adapter (params) {

    this.params = params || {};
    if (!this.params.url) {
        throw new Error("Connect params should be set");
    }

    this.config = {
        migrationFile: "migrationTemplate.js",
        migrationTable: "_migrations",
        nameFieldLength: 50,
    };

    if (this.params.eastMysql && this.params.eastMysql.migrationTable) {
        this.config.migrationTable = this.params.eastMysql.migrationTable;
    }

    if (this.params.eastMysql && this.params.eastMysql.migrationFile) {
        this.config.migrationFile = this.params.eastMysql.migrationFile;
    }

    if (this.params.eastMysql && this.params.eastMysql.resetExecution) {
        this.config.resetExecution = true;
    }

    if (this.params.eastMysql && this.params.eastMysql.nameFieldLength) {
        this.config.nameFieldLength = this.params.eastMysql.nameFieldLength;
    }
}


/**
 * Connect
 *
 * Handles the connection to the database.  If a parameter
 * "createDbOnConnect" is specified, it will attempt to
 * create the DB specified in the connection string during
 * connection
 *
 * @param cb
 */
Adapter.prototype.connect = function (cb) {

    var self = this;

    var tasks = [];

    /*
        First, create a connection without specifying DB to see if it exists
     */
    if (self.params.createDbOnConnect) {
        tasks.push(function (callback) {

            var connectionParams = connectonString.parse(self.params.url);
            var dbName = connectionParams.database;
            var connectionUrl = self.params.url.replace(dbName, "");

            var db = mysql.createConnection(connectionUrl);

            db.connect(function (err) {

                if (err) {
                    callback(err);
                    return;
                }

                db.query("CREATE DATABASE IF NOT EXISTS " + dbName, function (err) {

                    if (err) {
                        callback(err);
                        return;
                    }

                    db.end();

                    callback();

                });

            });

        });
    }


    /*
        Second, create the connection that the adapter will use
     */
    tasks.push(function (callback) {

        self.db = mysql.createConnection(self.params.url);

        self.db.connect(function (err) {

            if (err) {
                callback(err);
                return;
            }

            callback();

        });

    });

    /*
        Finally, create the migration table
     */
    tasks.push(function (callback) {

        var sql = "CREATE TABLE IF NOT EXISTS " + self.config.migrationTable + " (`name` VARCHAR(" + self.config.nameFieldLength + ") NOT NULL, PRIMARY KEY (`name`))";

        self.db.query(sql, function (err) {

            if (err) {
                callback(err);
                return;
            }

            callback();

        });

    });

    async.series(tasks, function (err) {

        if (err) {
            cb(err);
            return;
        }

        cb(null, {
            db: self.db
        });

    });

};


/**
 * Disconnect
 *
 * Disconnects from the database
 *
 * @param cb
 */
Adapter.prototype.disconnect = function (cb) {

    this.db.end();

    cb();

};


/**
 * Get Executed Migration Names
 *
 * Returns a list of all the migrations that have
 * already been executed
 *
 * @param cb
 */
Adapter.prototype.getExecutedMigrationNames = function (cb) {

    this.db.query("SELECT name FROM " + this.config.migrationTable, function (err, result) {

        if (err) {
            cb(err);
            return;
        }

        if (result instanceof Array && result.length > 0) {
            /* Valid result to return */

            cb(null, result.map(function (migration) {
                return migration.name;
            }));

        } else {
            /* Treat as no data in table */
            cb(null, []);
        }

    });

};


/**
 * Get Template Path
 *
 * Returns the path to the default template
 *
 * @returns {string}
 */
Adapter.prototype.getTemplatePath = function () {
    return path.join(__dirname, this.config.migrationFile);
};


/**
 * Mark Executed
 *
 * Mark that the current migration script has been
 * successfully executed
 *
 * @param name
 * @param cb
 */
Adapter.prototype.markExecuted = function (name, cb) {

    var sql = "INSERT INTO " + this.config.migrationTable + " SET ?";

    this.db.query(sql, {
        name: name
    }, function (err ) {

        if (err) {
            cb(err);
            return;
        }

        cb();

    });

};


/**
 * Unmark Executed
 *
 * Removed the current migration from the list of scripts
 * that have been run
 *
 * @param name
 * @param cb
 */
Adapter.prototype.unmarkExecuted = function (name, cb) {

    var sql = "DELETE FROM " + this.config.migrationTable + " WHERE name = ?";

    this.db.query(sql, [name], function (err) {

        if (err) {
            cb(err);
            return;
        }

        cb();

    });

};

/**
 * Reset Executed
 *
 * Reset the migrations table to remove all the entries
 * (executed scipts) in it
 *
 * @param cb
 */
Adapter.prototype.resetExecuted = function (cb) {

    var sql = "TRUNCATE TABLE " + this.config.migrationTable;

    this.db.query(sql, function (err) {

        if (err) {
            cb(err);
            return;
        }

        cb();

    });

};

/**
 * Before Migration
 *
 * Runs before every migration
 *
 * @param cb
 */
Adapter.prototype.beforeMigration = function (cb) {

    if (this.config.resetExecution) {
        this.resetExecuted(cb);
    }
    cb();

};


module.exports = Adapter;
