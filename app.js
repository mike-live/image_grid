/*
Copyright 2012 Google Inc.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

     http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

Author: Eric Bidelman (ericbidelman@chromium.org)
Updated: Joe Marini (joemarini@google.com)
*/

var chosenEntry = null;
var chooseDirButton = document.querySelector('#choose_dir');
var output = document.querySelector('output');
var textarea = document.querySelector('textarea');

function errorHandler(e) {
  console.error(e);
}

function displayEntryData(theEntry) {
  if (theEntry.isFile) {
    chrome.fileSystem.getDisplayPath(theEntry, function(path) {
      document.querySelector('#file_path').value = path;
    });
    theEntry.getMetadata(function(data) {
      //document.querySelector('#file_size').textContent = data.size;
    });    
  }
  else {
    document.querySelector('#file_path').value = theEntry.fullPath;
    //document.querySelector('#file_size').textContent = "N/A";
  }
}

function readAsText(fileEntry, callback) {
  fileEntry.file(function(file) {
    var reader = new FileReader();

    reader.onerror = errorHandler;
    reader.onload = function(e) {
      callback(e.target.result);
    };

    reader.readAsText(file);
  });
}

function readAsDataURL(fileEntry, callback) {
  fileEntry.file(function(file) {
	if (file.type.split("/")[0] != "image") {
		callback(null);
	} else {
		var reader = new FileReader();
		reader.onerror = errorHandler;
		reader.onload = function(e) {
		  callback(e.target.result);
		};

		reader.readAsDataURL(file);
	}
  });
}


function writeFileEntry(writableEntry, opt_blob, callback) {
  if (!writableEntry) {
    output.textContent = 'Nothing selected.';
    return;
  }

  writableEntry.createWriter(function(writer) {

    writer.onerror = errorHandler;
    writer.onwriteend = callback;

    // If we have data, write it to the file. Otherwise, just use the file we
    // loaded.
    if (opt_blob) {
      writer.truncate(opt_blob.size);
      waitForIO(writer, function() {
        writer.seek(0);
        writer.write(opt_blob);
      });
    } 
    else {
      chosenEntry.file(function(file) {
        writer.truncate(file.fileSize);
        waitForIO(writer, function() {
          writer.seek(0);
          writer.write(file);
        });
      });
    }
  }, errorHandler);
}

function waitForIO(writer, callback) {
  // set a watchdog to avoid eventual locking:
  var start = Date.now();
  // wait for a few seconds
  var reentrant = function() {
    if (writer.readyState===writer.WRITING && Date.now()-start<4000) {
      setTimeout(reentrant, 100);
      return;
    }
    if (writer.readyState===writer.WRITING) {
      console.error("Write operation taking too long, aborting!"+
        " (current writer readyState is "+writer.readyState+")");
      writer.abort();
    } 
    else {
      callback();
    }
  };
  setTimeout(reentrant, 100);
}

// for files, read the text content into the textarea
function loadFileEntry(_chosenEntry) {
  chosenEntry = _chosenEntry;
  chosenEntry.file(function(file) {
    readAsText(chosenEntry, function(result) {
      textarea.value = result;
    });
    // Update display.
    saveFileButton.disabled = false; // allow the user to save the content
    displayEntryData(chosenEntry);
  });
}
var files = [];
var directories = [];
var cnt = 0;

// for directories, read the contents of the top-level directory (ignore sub-dirs)
// and put the results into the textarea, then disable the Save As button
function loadDirEntry(_chosenEntry, callback) {
  chosenEntry = _chosenEntry;
  if (chosenEntry.isDirectory) {
    var dirReader = chosenEntry.createReader();

    // Call the reader.readEntries() until no more results are returned.
    var readEntries = function() {
		cnt += 1
        dirReader.readEntries (function(results) {
        if (!results.length) {
          //displayEntryData(chosenEntry);
        } 
        else {
          results.forEach(function(item) {
			loadDirEntry(item, callback)
			if (item.isDirectory) {
				directories = directories.concat({path: item.fullPath});
			} else {
				files = files.concat({path: item.fullPath, fileEntry: item});
			}
          });
          readEntries();
        }
		cnt -= 1;
		if (cnt == 0) {
			callback()
		}
      }, errorHandler);
    };

    readEntries(); // Start reading dirs.    
  }
}

chooseDirButton.addEventListener('click', function(e) {
  chrome.fileSystem.chooseEntry({type: 'openDirectory'}, function(theEntry) {
    if (!theEntry) {
      output.textContent = 'No Directory selected.';
      return;
    }
	chrome.fileSystem.getDisplayPath(theEntry, function(path) {
        //console.log(path);
		$('#status').text('Directory loading...');
		$('#file_path').text(path);
        // do something with path
    });
    // use local storage to retain access to this file
    chrome.storage.local.set({'chosenFile': chrome.fileSystem.retainEntry(theEntry)});
    directories = []
	files = []
	//var t0 = performance.now();
	loadDirEntry(theEntry, function() {
		console.log('Directory loaded.')
		$('#status').text('Directory loaded.');
		files = files.sort(function(a, b){return (a.path > b.path) - (a.path < b.path)});
		directories = directories.sort(function(a, b){return (a.path > b.path) - (a.path < b.path)});
		analyze_directory(files, directories);
		//var t1 = performance.now();
		//console.log('Loading time milliseconds: ' + (t1 - t0))
	});
	//displayEntryData(chosenEntry);
	//analyze_directory(entries)
	//textarea.value = entries.join("\n");
  });
});

function analyze_directory(files, directories) {
	console.log(directories[0]);
	var counts = {};
	for (var i = 0; i < directories.length; ++i) {
		entry = directories[i].path.split('/');
		fname = entry.reverse()[0];
		if (!counts[fname]) {
			counts[fname] = [0, 1000];
		}
		counts[fname][0] += 1;
		counts[fname][1] = Math.min(entry.length, counts[fname][1]);
	}
	var best = [];
	Object.keys(counts).forEach(function(key) {
		if (counts[key][0] > 1) {
			best = best.concat({key: key, count: counts[key][0], min_level: counts[key][1]});	
		}
	});
	console.log(best);
}

function get_sublist(entries, regex_str)
{
	var regex = new RegExp(regex_str);
	entries_sublist = []
	for (var i = 0; i < entries.length; ++i) {
		entry = entries[i].path;
		if (regex.test(entry)) {
			entries_sublist = entries_sublist.concat(entry)
		}
	}
	return entries_sublist
}

function get_sorted_keys(dict)
{
	var sorted_keys = [];
    for (var key in dict) {
        sorted_keys[sorted_keys.length] = key;
    }
    sorted_keys.sort();
	return sorted_keys;
}

function make_table_2(entries, regex_str)
{
	var regex = new RegExp(regex_str);
	entries_dict = {};
	x_keys = {};
	y_keys = {};
	var cnt = 0;
	for (var i = 0; i < entries.length; ++i) {
		entry = entries[i].path;
		if (regex.test(entry)) {
			var result = entry.match(regex)
			if (result.length > 1) {
				x_name = result.groups.x;
				y_name = result.groups.y;
				cur = entries[i]
				cur.name = x_name;
				x_keys[x_name] = 1;
				y_keys[y_name] = 1;
				if (!entries_dict[y_name]) {
					entries_dict[y_name] = {}
				}
				if (!entries_dict[y_name][x_name]) {
					entries_dict[y_name][x_name] = [];
				}
				entries_dict[y_name][x_name] = entries_dict[y_name][x_name].concat(cur)
				entries_dict[y_name][x_name] = entries_dict[y_name][x_name].concat(cur)
				cnt += 1;
			}
		}
	}
	sorted_x_keys = get_sorted_keys(x_keys);
	entries_table = {};
	for (var y_key in y_keys) {
		entries_table[y_key] = [];
		for (var i in sorted_x_keys) {
			x_key = sorted_x_keys[i];
			if (!entries_dict[y_key][x_key]) {
				entries_table[y_key] = entries_table[y_key].concat(null);
			} else {
				entries_table[y_key] = entries_table[y_key].concat(entries_dict[y_key][x_key][0]);
			}
		}
	}
	return entries_table
}

function make_table_1(entries, regex_str)
{
	var regex = new RegExp(regex_str);
	entries_table = {}
	var cnt = 0;
	for (var i = 0; i < entries.length; ++i) {
		entry = entries[i].path;
		if (regex.test(entry)) {
			var result = entry.match(regex)
			if (result.length > 1) {
				x_name = result.groups.x;
				y_name = result.groups.y;
				cur = entries[i]
				cur.name = x_name;
				
				if (!entries_table[y_name]) {
					entries_table[y_name] = [cur]
				} else {
					entries_table[y_name] = entries_table[y_name].concat(cur)
				}
				cnt += 1;
			}
		}
	}
	return entries_table
}

function load_images(table)
{
	for (var key in entries_table) {
		entries = entries_table[key];
		for (var i in entries) {
			
		}
	}
	
}

function upd_table(entries_table)
{
	var lenx = 0;
	var leny = Object.keys(entries_table).length;
	for (var key in entries_table) {
		lenx = Math.max(entries_table[key].length, lenx);
	}
	console.log('Table dims');
	console.log(leny);
	console.log(lenx);
	
	sorted_keys = get_sorted_keys(entries_table);
	
	var rows = $('#img_table tr');
	rows.remove()
	var table = $('#img_table');
	for (var i in sorted_keys) {
		key = sorted_keys[i];
		entries = entries_table[key];
		var row = $('<tr>');
		row.append($('<td>').attr('style', 'padding:0;').append($('<div>').text(key)));
		for (var i in entries) {
			entry = entries[i];
			var im = $('<img>');
			
			var handler = function(im) {
			   return function (result) { im.attr('src', result); }
			}(im);
			if (entry) {
				readAsDataURL(entry.fileEntry, handler);
				row.append($('<td>').attr('style', 'padding:0;').append($('<div>').text(entry.name)).append(im));
			} else {
				row.append($('<td>').attr('style', 'padding:0;'));
			}
		}
		table.append(row);
	}
	$('#zoom').slider('set value', 30);
}