'use strict';

var _ = require('underscore'),
    inspect = require('util').inspect;

/**
 * Run multiple behat feature files in parallel.
 *
 * Example usage:
 *
 * var behat = new BehatTask({
 *     files: ['feature1.feature', 'feature2.feature'],
 *     log: console.log,
 *     bin: 'behat',
 *     flags: '--tags @wip',
 *     executor: new ParallelExec(5),
 *     numRetries: 0
 * })
 *
 * @param {Object} options
 */
function BehatTask (options) {
    var tasks = {},
        failedTasks = {},
        startTime;

    /**
     * Create a behat command for each file and run it using the executor
     */
    function run() {
        startTime = +new Date();
        options.log.subhead('Found ' + options.files.length + ' feature file(s). Running ' + options.maxProcesses + ' at a time.');

        _.each(options.files, addTask);

        options.executor.on('startedTask', taskStarted);
        options.executor.on('finishedTask', taskFinished);
        options.executor.on('finished', finish);
        options.executor.start();
    }

    /**
     * Send an individual feature file to be run
     *
     * @param {String} file
     */
    function addTask (file) {
        var configOpt = options.config ? '-c ' + options.config : '',
            filePath = options.baseDir ? options.baseDir + file : file,
            cmd = [options.bin, configOpt, options.flags, filePath].join(' ');

        tasks[cmd] = file;
        options.executor.addTask(cmd);
    }

    /**
     * Tell the user we've started a new task
     *
     * @param  {string} task
     */
    function taskStarted (task) {
        options.log.writeln('Started: ' + task);
    }

    /**
     * Process the result of the task
     *
     * @param {string} task
     * @param {Object} err
     * @param {string} stdout
     * @param {string} stderr
     */
    function taskFinished (task, err, stdout, stderr) {
        var file = tasks[task],
            output = stdout ? stdout.split('\n') : [];

        if (err) {
            options.log.error('\nerr: \n' + inspect(err));
        }
        if (stderr) {
            options.log.error('\nstderr: \n' + stderr);
        }
        if (options.debug && stdout) {
            options.log.writeln('\nstdout: \n' + stdout);
        }

        if (err && (err.code === 13 || err.killed)) {
            options.log.writeln('Timeout: ' + file + ' - adding to the back of the queue.');
            options.executor.addTask(task);
        }
        else if (err && err.code === 1) {
            options.log.error('Failed: ' + file + ' - ' + output[output.length - 4] + ' in ' + output[output.length - 2]);
            taskPendingOrFailed(task);
        }
        else if (err) {
            options.log.error('Error: ' + file + ' - ' + err + stdout);
        }
        else {
            options.log.ok('Completed: ' + file + ' - ' + output[output.length - 4] + ' in ' + output[output.length - 2]);

            if (output[output.length - 4].indexOf('pending') > -1) {
                taskPendingOrFailed(task);
            }
        }
    }

    /**
     * Add the given task to the fail list and retry if options.numRetries is specified
     *
     * @param  {string} task
     */
    function taskPendingOrFailed (task) {
        failedTasks[task] = _.has(failedTasks, task) ? failedTasks[task] + 1 : 0;

        if (failedTasks[task] < options.numRetries) {
            options.log.writeln('Retrying: ' + tasks[task] + ' ' + (failedTasks[task] + 1) + ' of ' + options.numRetries + ' time(s)');
            options.executor.addTask(task);
        } else {
            options.fail.warn('Feature failed!');
        }
    }

    /**
     * Output the final run time and emit the finished event
     */
    function finish () {
        var totalTime = Math.floor((new Date() - startTime) / 1000);

        options.log.ok('\nFinished in ' + Math.floor(totalTime / 60) + 'm' + totalTime % 60 + 's');
        options.done();
    }

    this.run = run;
}

module.exports = BehatTask;
