# Injects the StoreKit proof unit-test target into a freshly prebuilt Expo iOS project (CI only; never committed
# into app.json, so EAS/TestFlight/App Store builds are untouched). Usage: ruby add_test_target.rb ios/SnapScore.xcodeproj SnapScore
require 'fileutils'
require 'xcodeproj'

proj_path, app_name = ARGV
abort 'usage: add_test_target.rb <xcodeproj> <app target>' unless proj_path && app_name
name = 'SnapScoreStoreKitTests'
here = __dir__
proj = Xcodeproj::Project.open(proj_path)
app = proj.targets.find { |t| t.name == app_name } or abort "no app target #{app_name}"
abort "#{name} already present" if proj.targets.any? { |t| t.name == name }

dir = File.join(File.dirname(proj_path), name)
FileUtils.mkdir_p(dir)
%w[StoreKitProofTests.swift SnapScore.storekit].each { |f| FileUtils.cp(File.join(here, f), dir) }

t = proj.new_target(:unit_test_bundle, name, :ios, '17.0', nil, :swift)
group = proj.main_group.new_group(name, name)
t.add_file_references([group.new_file('StoreKitProofTests.swift')])
t.resources_build_phase.add_file_reference(group.new_file('SnapScore.storekit'))
t.add_dependency(app)
t.build_configurations.each do |c|
  s = c.build_settings
  s['PRODUCT_NAME'] = '$(TARGET_NAME)' # xcodeproj leaves it empty -> PlugIns/.xctest collision
  s['TEST_HOST'] = "$(BUILT_PRODUCTS_DIR)/#{app_name}.app/#{app_name}"
  s['BUNDLE_LOADER'] = '$(TEST_HOST)'
  s['PRODUCT_BUNDLE_IDENTIFIER'] = 'com.scoresnap.app.storekit-proof-tests'
  s['GENERATE_INFOPLIST_FILE'] = 'YES'
  s['SWIFT_VERSION'] = '5.0'
  s['IPHONEOS_DEPLOYMENT_TARGET'] = '17.0' # SKTestSession.buyProduct(identifier:options:) is iOS 17+
  s['CODE_SIGNING_ALLOWED'] = 'NO'
end
proj.save

scheme = Xcodeproj::XCScheme.new
scheme.add_build_target(app)
scheme.add_test_target(t)
scheme.set_launch_target(app)
scheme.save_as(proj_path, name, true)
puts "added #{name} (host #{app_name}) + shared scheme #{name}"
