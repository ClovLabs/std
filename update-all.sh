#!/bin/bash
for package in $(ls packages); do
	echo "updating package: $package"
	cd packages/$package
	bun update
	bun update --latest
	cd ../../
done